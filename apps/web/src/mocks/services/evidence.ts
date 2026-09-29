import type { EvidenceCategory } from '@cpi/contracts';

/** Proposed allowlist and limits (FR06). Signature checks catch renamed executables (AT21). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_SUBMISSION_BYTES = 100 * 1024 * 1024;

const signatures: {
  extensions: string[];
  mimeType: string;
  magic: number[];
}[] = [
  {
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    magic: [0x25, 0x50, 0x44, 0x46],
  },
  {
    extensions: ['png'],
    mimeType: 'image/png',
    magic: [0x89, 0x50, 0x4e, 0x47],
  },
  {
    extensions: ['jpg', 'jpeg'],
    mimeType: 'image/jpeg',
    magic: [0xff, 0xd8, 0xff],
  },
  {
    extensions: ['docx'],
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
  {
    extensions: ['xlsx'],
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
];

export type UploadCheck =
  { ok: true; mimeType: string } | { ok: false; message: string };

export function checkUpload(fileName: string, bytes: Uint8Array): UploadCheck {
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  const rule = signatures.find((candidate) =>
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
  if (!rule.magic.every((byte, index) => bytes[index] === byte)) {
    return {
      ok: false,
      message: `The file's contents do not match a .${extension} file, so it was not accepted.`,
    };
  }
  return { ok: true, mimeType: rule.mimeType };
}

export async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export const evidenceCategories: EvidenceCategory[] = [
  'cpc_minutes',
  'iao_minutes',
  'procedures',
  'risk_assessment',
  'mitigation_plan',
  'other',
];
