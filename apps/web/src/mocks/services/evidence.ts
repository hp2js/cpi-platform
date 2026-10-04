import type { EvidenceCategory } from '@cpi/contracts';

/** File types, limits and content checks are shared with the API (PRD §9.2, FR06, AT21). */
export {
  checkUpload,
  MAX_FILE_BYTES,
  MAX_SUBMISSION_BYTES,
  type UploadCheck,
} from '@cpi/contracts';

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
