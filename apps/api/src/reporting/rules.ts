import type {
  Completeness,
  EvidenceAnswer,
  EvidenceCategory,
  FormVersion,
  Milestone,
  ReportAnswers,
} from '@cpi/contracts';

/*
 * Quarterly reporting rules (PRD §7.2, FR05–FR07), ported from the mock API's services.
 */

/** Proposed allowlist and limits (FR06). Signature checks catch renamed executables (AT21). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_SUBMISSION_BYTES = 100 * 1024 * 1024;

export const evidenceCategories: EvidenceCategory[] = [
  'cpc_minutes',
  'iao_minutes',
  'procedures',
  'risk_assessment',
  'mitigation_plan',
  'other',
];

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

/** Drafts are open before first submission, and again while a clarification awaits a revision. */
export function isEditableState(state: string) {
  return (
    state === 'not_started' ||
    state === 'draft' ||
    state === 'clarification_requested'
  );
}

export function emptyAnswers(
  form: FormVersion,
  milestones: Milestone[],
): ReportAnswers {
  const questions: ReportAnswers['questions'] = {};
  for (const question of form.sections.flatMap(
    (section) => section.questions,
  )) {
    if (question.type === 'milestone_progress') continue;
    questions[question.id] =
      question.type === 'evidence'
        ? { evidenceIds: [], unavailable: null }
        : question.type === 'yes_no'
          ? null
          : '';
  }
  const milestoneAnswers: ReportAnswers['milestones'] = {};
  for (const milestone of milestones) {
    milestoneAnswers[milestone.id] = {
      completed: null,
      output: '',
      emergingIssues: '',
      actions: '',
      evidence: [],
      evidenceUnavailable: null,
    };
  }
  return { questions, milestones: milestoneAnswers };
}

const filled = (value: unknown) =>
  typeof value === 'string'
    ? value.trim().length > 0
    : value !== null && value !== undefined;

/**
 * Server-side completion check (PRD §7.2): separates unanswered items, which block submission,
 * from honest declarations, which are submittable.
 */
export function completeness(
  form: FormVersion,
  milestones: Milestone[],
  answers: ReportAnswers,
  evidenceIds: string[],
): Completeness {
  const missing: Completeness['missing'] = [];
  const declarations: Completeness['declarations'] = [];
  for (const question of form.sections.flatMap(
    (section) => section.questions,
  )) {
    const field = `questions.${question.id}`;
    if (question.type === 'milestone_progress') {
      for (const milestone of milestones) {
        const base = `milestones.${milestone.id}`;
        const label = `${milestone.code} ${milestone.title}`;
        const response = answers.milestones[milestone.id];
        if (!response || response.completed === null) {
          missing.push({
            field: `${base}.completed`,
            label,
            message: 'Say whether this milestone was completed.',
          });
          continue;
        }
        if (response.completed) {
          if (!response.output.trim())
            missing.push({
              field: `${base}.output`,
              label,
              message: 'Describe the output achieved.',
            });
          const references = response.evidence.filter((reference) =>
            evidenceIds.includes(reference.evidenceId),
          );
          if (references.length === 0 && !response.evidenceUnavailable) {
            missing.push({
              field: `${base}.evidence`,
              label,
              message:
                'Reference supporting evidence, or declare that it is not available.',
            });
          }
          if (references.some((reference) => !reference.passage.trim())) {
            missing.push({
              field: `${base}.evidence`,
              label,
              message: 'Give the page or section for each referenced file.',
            });
          }
          if (response.evidenceUnavailable) {
            if (response.evidenceUnavailable.explanation.trim().length < 10) {
              missing.push({
                field: `${base}.evidenceUnavailable`,
                label,
                message:
                  'Explain why the evidence is not available (at least 10 characters).',
              });
            } else {
              declarations.push({
                field: `${base}.evidenceUnavailable`,
                label,
                message: `Evidence declared not available: ${response.evidenceUnavailable.explanation}`,
              });
            }
          }
        } else {
          if (!response.emergingIssues.trim())
            missing.push({
              field: `${base}.emergingIssues`,
              label,
              message: 'Explain why the milestone was not completed.',
            });
          declarations.push({
            field: `${base}.completed`,
            label,
            message: 'Declared not completed this quarter.',
          });
        }
      }
      continue;
    }
    if (!question.required && question.type !== 'evidence') continue;
    const value = answers.questions[question.id];
    if (question.type === 'evidence') {
      const answer = (value ?? {
        evidenceIds: [],
        unavailable: null,
      }) as EvidenceAnswer;
      const supplied = answer.evidenceIds.filter((id) =>
        evidenceIds.includes(id),
      );
      if (answer.unavailable) {
        if (answer.unavailable.explanation.trim().length < 10)
          missing.push({
            field: `${field}.unavailable`,
            label: question.label,
            message:
              'Explain why this is not available (at least 10 characters).',
          });
        else
          declarations.push({
            field: `${field}.unavailable`,
            label: question.label,
            message: `Declared not available: ${answer.unavailable.explanation}`,
          });
      } else if (question.required && supplied.length === 0) {
        missing.push({
          field,
          label: question.label,
          message: 'Upload the document, or declare that it is not available.',
        });
      }
      continue;
    }
    if (!filled(value))
      missing.push({
        field,
        label: question.label,
        message: 'Answer this question.',
      });
  }
  return { complete: missing.length === 0, missing, declarations };
}

/** Evidence the draft actually references, which is what a submission attaches. */
export function referencedEvidenceIds(
  answers: ReportAnswers,
  available: string[],
) {
  const ids = new Set<string>();
  for (const value of Object.values(answers.questions)) {
    if (value && typeof value === 'object' && 'evidenceIds' in value)
      value.evidenceIds.forEach((id) => ids.add(id));
  }
  for (const response of Object.values(answers.milestones))
    response.evidence.forEach((reference) => ids.add(reference.evidenceId));
  return [...ids].filter((id) => available.includes(id));
}
