import type { EvidenceCategory } from '@cpi/contracts';

/*
 * Quarterly reporting rules (PRD §7.2, FR05–FR07), ported from the mock API's services.
 */

/** File types, limits and content checks are shared with the development mock (PRD §9.2, FR06, AT21). */
export {
  checkUpload,
  MAX_FILE_BYTES,
  MAX_SUBMISSION_BYTES,
  type UploadCheck,
} from '@cpi/contracts';

export const evidenceCategories: EvidenceCategory[] = [
  'cpc_minutes',
  'iao_minutes',
  'procedures',
  'risk_assessment',
  'mitigation_plan',
  'other',
];

/** Drafts are open before first submission, and again while a clarification awaits a revision. */
export function isEditableState(state: string) {
  return (
    state === 'not_started' ||
    state === 'draft' ||
    state === 'clarification_requested'
  );
}

// Shared with the development mock so both give the same answers (FR03, PRD §7.2).
export {
  completeness,
  emptyAnswers,
  referencedEvidenceIds,
} from '@cpi/contracts';
