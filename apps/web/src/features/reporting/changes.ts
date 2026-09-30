import {
  isChecklistAnswer,
  isEvidenceAnswer,
  isRowsAnswer,
  type AnswerValue,
  type EvidenceItem,
  type FormVersion,
  type Milestone,
  type MilestoneResponse,
  type Question,
  type ReportAnswers,
} from '@cpi/contracts';
import { fieldDomId } from './answers';

export interface AnswerChange {
  /** The field's DOM id on the report page, for "change this" links. */
  field: string;
  label: string;
  before: string;
  after: string;
}

const NONE = 'Not answered';

/**
 * What a draft changes compared with the last submitted revision, in words the focal person
 * recognises. Used before submitting a clarification response (PRD §7.3).
 */
export function answerChanges(
  form: FormVersion,
  milestones: Milestone[],
  evidence: EvidenceItem[],
  before: ReportAnswers,
  after: ReportAnswers,
): AnswerChange[] {
  const fileName = (id: string) =>
    evidence.find((item) => item.id === id)?.fileName ?? id;
  // Same wording as AnswerValue, as one line of text per answer.
  const scalar = (answer: unknown, unit?: string) =>
    answer === true
      ? 'Yes'
      : answer === false
        ? 'No'
        : answer === null ||
            answer === undefined ||
            String(answer).trim() === ''
          ? NONE
          : `${String(answer)}${unit ? ` ${unit}` : ''}`;
  const value = (question: Question, answer: AnswerValue | undefined) => {
    if (isEvidenceAnswer(answer))
      return answer.unavailable
        ? `Not available: ${answer.unavailable.explanation}`
        : answer.evidenceIds.map(fileName).join(', ') || NONE;
    if (isChecklistAnswer(answer))
      return (question.items ?? [])
        .map(
          (item) =>
            `${item.label}: ${answer.items[item.id] === true ? 'Done' : answer.items[item.id] === false ? 'Not done' : NONE}`,
        )
        .join('; ');
    if (isRowsAnswer(answer))
      return (
        answer.rows
          .map((row, index) =>
            [
              `Row ${index + 1}`,
              ...(question.columns ?? []).map(
                (column) =>
                  `${column.label} ${scalar(row[column.id], column.limits?.unit)}`,
              ),
            ].join(', '),
          )
          .join('; ') || 'No rows'
      );
    return scalar(answer, question.limits?.unit);
  };
  const changes: AnswerChange[] = [];
  const push = (path: string, label: string, was: string, now: string) => {
    if (was !== now)
      changes.push({ field: fieldDomId(path), label, before: was, after: now });
  };

  for (const question of form.sections.flatMap((section) => section.questions))
    if (question.type !== 'milestone_progress')
      push(
        `questions.${question.id}`,
        question.label,
        value(question, before.questions[question.id]),
        value(question, after.questions[question.id]),
      );

  const text = (answer: string | undefined) => answer?.trim() || NONE;
  const fields: [
    keyof MilestoneResponse,
    string,
    (response: MilestoneResponse | undefined) => string,
  ][] = [
    [
      'completed',
      'completed',
      (response) =>
        response?.completed === true
          ? 'Completed'
          : response?.completed === false
            ? 'Not completed'
            : NONE,
    ],
    ['output', 'output achieved', (response) => text(response?.output)],
    [
      'evidence',
      'supporting evidence',
      (response) =>
        response?.evidence
          .map((reference) =>
            reference.passage
              ? `${fileName(reference.evidenceId)} (${reference.passage})`
              : fileName(reference.evidenceId),
          )
          .join(', ') || NONE,
    ],
    [
      'evidenceUnavailable',
      'evidence not available',
      (response) => response?.evidenceUnavailable?.explanation || NONE,
    ],
    [
      'emergingIssues',
      'why it was not completed',
      (response) => text(response?.emergingIssues),
    ],
    ['actions', 'actions', (response) => text(response?.actions)],
  ];
  for (const milestone of milestones)
    for (const [key, label, show] of fields)
      push(
        `milestones.${milestone.id}.${key}`,
        `${milestone.code} ${label}`,
        show(before.milestones[milestone.id]),
        show(after.milestones[milestone.id]),
      );
  return changes;
}
