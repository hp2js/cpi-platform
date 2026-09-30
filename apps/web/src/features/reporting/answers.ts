import {
  emptyAnswer,
  isEvidenceAnswer,
  type FormVersion,
  type Milestone,
  type ReportAnswers,
} from '@cpi/contracts';

/**
 * Builds the answer structure for a form and baseline, keeping any saved values. This is
 * structural only; completeness and scoring are decided by the server.
 */
export function answersFor(
  form: FormVersion,
  milestones: Milestone[],
  saved?: ReportAnswers,
): ReportAnswers {
  const questions: ReportAnswers['questions'] = {};
  for (const question of form.sections.flatMap(
    (section) => section.questions,
  )) {
    if (question.type === 'milestone_progress') continue;
    const empty = emptyAnswer(question);
    questions[question.id] = saved?.questions[question.id] ?? empty;
  }
  const milestoneAnswers: ReportAnswers['milestones'] = {};
  for (const milestone of milestones) {
    milestoneAnswers[milestone.id] = saved?.milestones[milestone.id] ?? {
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

/** DOM id for a server field path, used for anchors from the completeness check. */
export function fieldDomId(path: string) {
  return `field-${path.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export const evidenceCategoryLabel: Record<string, string> = {
  cpc_minutes: 'CPC minutes',
  iao_minutes: 'IAO minutes',
  procedures: 'Procedures',
  risk_assessment: 'Risk assessment',
  mitigation_plan: 'Mitigation plan',
  other: 'Other',
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Points every reference to a replaced file at its new version. */
export function replaceEvidence(
  answers: ReportAnswers,
  fromId: string,
  toId: string,
): ReportAnswers {
  const questions: ReportAnswers['questions'] = {};
  for (const [id, value] of Object.entries(answers.questions)) {
    questions[id] = isEvidenceAnswer(value)
      ? {
          ...value,
          evidenceIds: value.evidenceIds.map((evidenceId) =>
            evidenceId === fromId ? toId : evidenceId,
          ),
        }
      : value;
  }
  const milestones: ReportAnswers['milestones'] = {};
  for (const [id, response] of Object.entries(answers.milestones)) {
    milestones[id] = {
      ...response,
      evidence: response.evidence.map((reference) =>
        reference.evidenceId === fromId
          ? { ...reference, evidenceId: toId }
          : reference,
      ),
    };
  }
  return { questions, milestones };
}
