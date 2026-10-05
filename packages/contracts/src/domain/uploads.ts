/*
 * Upload checks (PRD §9.2, FR06, AT21), shared by the API and the development mock. They inspect
 * structure only: a file that cannot be inspected (password-protected, damaged) or that carries
 * active content is refused. This is not antivirus scanning; real documents stay gated on it.
 *
 * Bounds: files are at most 20 MiB and are read in linear passes; the ZIP directory is read
 * without decompressing; the only part decompressed is `[Content_Types].xml`, refused when it
 * declares or inflates beyond 1 MiB, so an archive bomb cannot expand.
 */

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_SUBMISSION_BYTES = 100 * 1024 * 1024;

export type UploadCheck =
  { ok: true; mimeType: string } | { ok: false; message: string };

type Kind = 'pdf' | 'png' | 'jpeg' | 'docx' | 'xlsx';

const rules: {
  kind: Kind;
  extensions: string[];
  mimeType: string;
  magic: number[];
}[] = [
  {
    kind: 'pdf',
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    magic: [0x25, 0x50, 0x44, 0x46],
  },
  {
    kind: 'png',
    extensions: ['png'],
    mimeType: 'image/png',
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    kind: 'jpeg',
    extensions: ['jpg', 'jpeg'],
    mimeType: 'image/jpeg',
    magic: [0xff, 0xd8, 0xff],
  },
  {
    kind: 'docx',
    extensions: ['docx'],
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
  {
    kind: 'xlsx',
    extensions: ['xlsx'],
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
];

const DAMAGED =
  'This file appears to be damaged or incomplete, so it could not be checked. Save it again and upload the new copy.';
const PROTECTED =
  'This file is password-protected, so it could not be checked. Remove the password and upload it again.';
const mismatch = (extension: string) =>
  `The file's contents do not match a .${extension} file, so it was not accepted.`;
const ACTIVE =
  'This file contains macros, scripts or embedded programs, which are not accepted. Save a copy without them (for example as a PDF) and upload that.';

export async function checkUpload(
  fileName: string,
  bytes: Uint8Array,
): Promise<UploadCheck> {
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  const rule = rules.find((candidate) =>
    candidate.extensions.includes(extension),
  );
  if (!rule)
    return {
      ok: false,
      message:
        'This file type is not accepted. Upload a PDF, DOCX, XLSX, JPEG or PNG file.',
    };
  if (bytes.byteLength === 0)
    return { ok: false, message: 'The file is empty.' };
  if (bytes.byteLength > MAX_FILE_BYTES)
    return { ok: false, message: 'Files must be 20 MB or smaller.' };
  if (!rule.magic.every((byte, index) => bytes[index] === byte))
    return { ok: false, message: mismatch(extension) };
  const problem = await inspect(rule.kind, bytes);
  return problem
    ? { ok: false, message: problem }
    : { ok: true, mimeType: rule.mimeType };
}

/** The reason a well-labelled file is still refused, or null. */
async function inspect(kind: Kind, bytes: Uint8Array): Promise<string | null> {
  switch (kind) {
    case 'pdf':
      return inspectPdf(bytes);
    case 'png':
      return ascii(bytes, 12, 16) === 'IHDR' && tail(bytes).includes('IEND')
        ? null
        : DAMAGED;
    case 'jpeg':
      return tail(bytes).includes('\xff\xd9') ? null : DAMAGED;
    case 'docx':
    case 'xlsx':
      return inspectOffice(kind, bytes);
  }
}

const latin1 = new TextDecoder('latin1');
/** One character per byte (windows-1252, which keeps the ASCII markers and 0xFF 0xD9 intact). */
const ascii = (bytes: Uint8Array, start: number, end: number) =>
  latin1.decode(bytes.subarray(Math.max(0, start), end));

/** The last kilobyte, where end-of-file markers live (writers may append a little padding). */
const tail = (bytes: Uint8Array) =>
  ascii(bytes, bytes.length - 1024, bytes.length);

/**
 * A complete, unencrypted PDF without scripts, launch actions or attached files. Only object
 * dictionaries are searched (stream data is binary and would match by chance), with `#xx` name
 * escapes decoded. ponytail: names inside compressed object streams are not seen; a PDF parser
 * (or the scanner) closes that gap.
 */
function inspectPdf(bytes: Uint8Array) {
  if (!tail(bytes).includes('%%EOF')) return DAMAGED;
  const text = ascii(bytes, 0, bytes.length)
    .replace(/stream\r?\n[\s\S]*?endstream/g, '')
    .replace(/#([0-9a-f]{2})/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  if (/\/Encrypt\b/.test(text)) return PROTECTED;
  if (/\/(JavaScript|JS|Launch|EmbeddedFiles?)\b/.test(text)) return ACTIVE;
  return null;
}

const MAIN_PART = {
  docx: {
    name: 'word/document.xml',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  },
  xlsx: {
    name: 'xl/workbook.xml',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  },
};

/**
 * A real Office Open XML package of the claimed kind: a readable ZIP central directory, no
 * encrypted entries, a content-types part declaring the claimed main document (not a template
 * or a macro-enabled variant), and no macros, OLE objects or ActiveX.
 */
async function inspectOffice(kind: 'docx' | 'xlsx', bytes: Uint8Array) {
  const entries = zipEntries(bytes);
  if (!entries) return DAMAGED;
  if (entries.some((entry) => entry.encrypted)) return PROTECTED;
  const types = entries.find((entry) => entry.name === '[Content_Types].xml');
  if (!types || !entries.some((entry) => entry.name === MAIN_PART[kind].name))
    return DAMAGED;
  if (
    entries.some((entry) =>
      /(^|\/)vbaProject\.bin$|\/embeddings\/oleObject[^/]*\.bin$|\/activeX\//i.test(
        entry.name,
      ),
    )
  )
    return ACTIVE;
  const declared = await entryText(bytes, types);
  if (declared === null) return DAMAGED;
  if (/macroEnabled|vbaProject/i.test(declared)) return ACTIVE;
  if (!declared.includes(`"${MAIN_PART[kind].type}"`)) return mismatch(kind);
  return null;
}

type ZipEntry = {
  name: string;
  encrypted: boolean;
  method: number;
  compressedSize: number;
  size: number;
  headerOffset: number;
};

/** Entries from the ZIP central directory; null when it cannot be read. */
function zipEntries(bytes: Uint8Array): ZipEntry[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record is within the last 22 + 65,535 (comment) bytes.
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 22 - 0xffff);
    offset--
  )
    if (view.getUint32(offset, true) === 0x06054b50) {
      end = offset;
      break;
    }
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  // 0xffff/0xffffffff mean ZIP64, which a 20 MB Office file never needs.
  if (count === 0xffff || offset === 0xffffffff) return null;
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      return null;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      name: ascii(bytes, offset + 46, offset + 46 + nameLength),
      encrypted: (view.getUint16(offset + 8, true) & 1) === 1,
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      size: view.getUint32(offset + 24, true),
      headerOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const MAX_PART_BYTES = 1024 * 1024;

/** A small stored or deflated entry as text; null when missing, too large or unreadable. */
async function entryText(bytes: Uint8Array, entry: ZipEntry) {
  if (entry.size > MAX_PART_BYTES || entry.compressedSize > MAX_PART_BYTES)
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = entry.headerOffset;
  if (header + 30 > bytes.length || view.getUint32(header, true) !== 0x04034b50)
    return null;
  const start =
    header +
    30 +
    view.getUint16(header + 26, true) +
    view.getUint16(header + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (data.length !== entry.compressedSize) return null;
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) return null;
  try {
    // Inflate with a running cap, whatever the directory claims.
    const reader = new Blob([data as Uint8Array<ArrayBuffer>])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
      .getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_PART_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return await new Blob(chunks as Uint8Array<ArrayBuffer>[]).text();
  } catch {
    return null;
  }
}
