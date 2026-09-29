/**
 * File contents for the mock API. Records in the store keep metadata only; the bytes are kept
 * by SHA-256 in memory and, in a browser, in IndexedDB, so uploads survive a reload the way a
 * real object store would. Keying by hash means a reset or a reused record ID can never serve
 * another file's contents.
 */

const memory = new Map<string, Uint8Array<ArrayBuffer>>();
const DB_NAME = 'cpi-mock-files';
const STORE = 'files';

function openDatabase(): Promise<IDBDatabase> | undefined {
  try {
    if (typeof indexedDB === 'undefined') return undefined;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('open'));
    });
  } catch {
    return undefined;
  }
}

let database: Promise<IDBDatabase> | undefined;
const connection = () => (database ??= openDatabase());

export async function storeFile(
  sha256: string,
  bytes: Uint8Array<ArrayBuffer>,
) {
  memory.set(sha256, bytes);
  try {
    const db = await connection();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(bytes, sha256);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('put'));
    });
  } catch {
    /* storage full or blocked: the file stays available until the page reloads */
  }
}

export async function loadFile(
  sha256: string,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const cached = memory.get(sha256);
  if (cached) return cached;
  try {
    const db = await connection();
    if (!db) return undefined;
    const stored = await new Promise<unknown>((resolve, reject) => {
      const request = db
        .transaction(STORE, 'readonly')
        .objectStore(STORE)
        .get(sha256);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('get'));
    });
    if (!(stored instanceof Uint8Array)) return undefined;
    const bytes = new Uint8Array(stored);
    memory.set(sha256, bytes);
    return bytes;
  } catch {
    return undefined;
  }
}

/** Escapes text for a PDF string literal; non-Latin-1 characters become `?`. */
const pdfText = (text: string) =>
  text
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    .replace(/[\\()]/g, (character) => `\\${character}`);

/**
 * A small, valid one-page PDF with the given lines, so seeded demonstration files open in any
 * viewer like real ones. Long lines wrap at about 90 characters.
 */
export function demonstrationPdf(title: string, lines: string[]) {
  const wrapped = lines.flatMap((line) => {
    const out: string[] = [];
    let rest = line;
    while (rest.length > 90) {
      const cut = rest.lastIndexOf(' ', 90);
      const at = cut > 40 ? cut : 90;
      out.push(rest.slice(0, at));
      rest = rest.slice(at).trimStart();
    }
    out.push(rest);
    return out;
  });
  const content = [
    'BT',
    '/F1 16 Tf',
    '56 780 Td',
    `(${pdfText(title)}) Tj`,
    '/F1 11 Tf',
    '0 -28 Td',
    '15 TL',
    ...wrapped.slice(0, 44).map((line) => `(${pdfText(line)}) '`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Latin-1: one byte per character, so the offsets above are byte offsets.
  return Uint8Array.from(body, (character) => character.charCodeAt(0));
}
