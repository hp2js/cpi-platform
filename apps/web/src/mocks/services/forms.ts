import type { FormIssue, FormVersion, Question } from '@cpi/contracts';
import { getDb } from '../db';
import { activeProfile, profileIssues } from './profiles';

/** The latest published version assigned to a period; open periods keep theirs (PRD §7.1). */
export function publishedFormForPeriod(
  periodId: string,
): FormVersion | undefined {
  return getDb()
    .forms.filter(
      (form) =>
        form.status === 'published' && form.periodIds.includes(periodId),
    )
    .sort((a, b) => b.version - a.version)[0];
}

/** A period is locked to its version once reporting has started on it. */
export function periodLocked(periodId: string) {
  const db = getDb();
  if (!publishedFormForPeriod(periodId)) return false;
  const period = db.cycle.periods.find(
    (candidate) => candidate.id === periodId,
  );
  const reportingOpen = period
    ? Date.parse(db.businessTime) >
      Date.parse(`${period.endsOn}T23:59:59+03:00`)
    : false;
  const started = db.obligations.some(
    (obligation) =>
      obligation.periodId === periodId && obligation.state !== 'not_started',
  );
  return reportingOpen || started;
}

/** Publication rules from FR03 and AT03; each issue points to the field to fix. */
export function validateForm(form: FormVersion): FormIssue[] {
  const db = getDb();
  const issues: FormIssue[] = [];
  if (!form.title.trim())
    issues.push({ path: 'title', message: 'Give the form a title.' });

  // Weights come from the cycle's scoring profile, which must be approved and valid (§7.1).
  const profile = activeProfile(db);
  if (profile.status !== 'approved' || profileIssues(profile, db).length)
    issues.push({
      path: 'profile',
      message: `The cycle's scoring profile, ${profile.name}, is not approved and valid. Fix it in Settings.`,
    });

  const sectionIds = new Set<string>();
  const questionIds = new Set<string>();
  let milestoneBlocks = 0;
  form.sections.forEach((section, sectionIndex) => {
    const sectionPath = `sections.${sectionIndex}`;
    if (sectionIds.has(section.id))
      issues.push({
        path: `${sectionPath}.id`,
        message: `Section ID "${section.id}" is used more than once.`,
      });
    sectionIds.add(section.id);
    if (!section.title.trim())
      issues.push({
        path: `${sectionPath}.title`,
        message: 'Give the section a title.',
      });
    if (section.questions.length === 0)
      issues.push({
        path: `${sectionPath}.questions`,
        message: 'Add at least one question or remove the section.',
      });
    section.questions.forEach((question, questionIndex) => {
      const path = `${sectionPath}.questions.${questionIndex}`;
      if (questionIds.has(question.id))
        issues.push({
          path: `${path}.id`,
          message: `Question ID "${question.id}" is used more than once.`,
        });
      questionIds.add(question.id);
      if (!question.label.trim())
        issues.push({
          path: `${path}.label`,
          message: 'Give the question a label.',
        });
      if (
        question.type === 'choice' &&
        (question.choices?.filter((choice) => choice.trim()).length ?? 0) < 2
      ) {
        issues.push({
          path: `${path}.choices`,
          message: 'A choice question needs at least two options.',
        });
      }
      if (question.type === 'evidence' && !question.evidenceCategory)
        issues.push({
          path: `${path}.evidenceCategory`,
          message: 'Choose the evidence category.',
        });
      issues.push(...typeIssues(question, path));
      if (question.type === 'milestone_progress') {
        milestoneBlocks += 1;
        if (question.kind !== 'scored' || !question.required)
          issues.push({
            path,
            message: 'Milestone progress must be required and scored.',
          });
      } else if (question.kind === 'scored') {
        issues.push({
          path: `${path}.kind`,
          message:
            'Only milestone progress is scored in this profile; mark this question informational.',
        });
      }
    });
  });
  if (milestoneBlocks !== 1)
    issues.push({
      path: 'sections',
      message: 'The form needs exactly one milestone progress block.',
    });

  // An ID keeps its meaning in every version: a retired ID never returns as another type.
  const earlier = db.forms.filter((candidate) => candidate.id !== form.id);
  form.sections.forEach((section, sectionIndex) =>
    section.questions.forEach((question, questionIndex) => {
      const path = `sections.${sectionIndex}.questions.${questionIndex}`;
      for (const version of earlier) {
        const previous = version.sections
          .flatMap((candidate) => candidate.questions)
          .find((candidate) => candidate.id === question.id);
        if (!previous) continue;
        if (previous.type !== question.type) {
          issues.push({
            path: `${path}.id`,
            message: `Question ID "${question.id}" was a ${previous.type.replace('_', ' ')} question in version ${version.version}. A different question needs a new ID.`,
          });
          break;
        }
        const clash = (question.columns ?? []).find((column) => {
          const old = previous.columns?.find((item) => item.id === column.id);
          return old && old.type !== column.type;
        });
        if (clash) {
          issues.push({
            path: `${path}.columns`,
            message: `Column ID "${clash.id}" had another type in version ${version.version}. A different column needs a new ID.`,
          });
          break;
        }
      }
    }),
  );

  // Scored criteria cannot change after activation (FR03, PRD §7.1).
  const base = form.basedOnVersion
    ? db.forms.find((candidate) => candidate.version === form.basedOnVersion)
    : undefined;
  if (base) {
    const scored = (version: FormVersion) =>
      version.sections.flatMap((section) =>
        section.questions
          .filter((question) => question.kind === 'scored')
          .map((question) => `${question.id}:${question.type}`),
      );
    if (JSON.stringify(scored(base)) !== JSON.stringify(scored(form))) {
      issues.push({
        path: 'sections',
        message:
          'Scored criteria cannot change after the cycle is active. This needs an approved profile change, not a form edit.',
      });
    }
  }

  if (form.periodIds.length === 0)
    issues.push({
      path: 'periodIds',
      message: 'Assign the form to at least one period.',
    });
  for (const periodId of form.periodIds) {
    if (periodLocked(periodId)) {
      const label =
        db.cycle.periods.find((period) => period.id === periodId)?.label ??
        periodId;
      issues.push({
        path: 'periodIds',
        message: `${label} has started reporting on its assigned version and cannot move to a new one.`,
      });
    }
  }
  const covered = new Set([
    ...db.forms
      .filter((candidate) => candidate.status === 'published')
      .flatMap((candidate) => candidate.periodIds),
    ...form.periodIds,
  ]);
  const uncovered = db.cycle.periods
    .filter((period) => !covered.has(period.id))
    .map((period) => period.label);
  if (uncovered.length)
    issues.push({
      path: 'periodIds',
      message: `Every period needs a form. Not yet assigned: ${uncovered.join(', ')}.`,
    });
  return issues;
}

const TEXT_TYPES = ['text', 'long_text'];

function limitIssues(
  limits: Question['limits'],
  type: string,
  path: string,
): FormIssue[] {
  if (!limits) return [];
  const issues: FormIssue[] = [];
  const numeric =
    limits.min !== undefined ||
    limits.max !== undefined ||
    limits.integer ||
    limits.unit;
  if (numeric && type !== 'number')
    issues.push({
      path: `${path}.limits`,
      message: 'A range, whole numbers or a unit apply only to numbers.',
    });
  if (limits.maxLength && !TEXT_TYPES.includes(type))
    issues.push({
      path: `${path}.limits`,
      message: 'A length limit applies only to text.',
    });
  if ((limits.earliest || limits.latest) && type !== 'date')
    issues.push({
      path: `${path}.limits`,
      message: 'A date range applies only to dates.',
    });
  if (
    limits.min !== undefined &&
    limits.max !== undefined &&
    limits.min > limits.max
  )
    issues.push({
      path: `${path}.limits`,
      message: 'The lowest value must not be above the highest.',
    });
  if (limits.earliest && limits.latest && limits.earliest > limits.latest)
    issues.push({
      path: `${path}.limits`,
      message: 'The earliest date must not be after the latest.',
    });
  return issues;
}

/** Rules for the checklist and repeated-row types, and limits on any type. */
function typeIssues(question: Question, path: string): FormIssue[] {
  const issues = limitIssues(question.limits, question.type, path);
  if (question.type === 'checklist') {
    const items = question.items ?? [];
    if (items.length < 1)
      issues.push({
        path: `${path}.items`,
        message: 'A checklist needs at least one item.',
      });
    if (items.some((item) => !item.label.trim()))
      issues.push({
        path: `${path}.items`,
        message: 'Give every checklist item a label.',
      });
    if (new Set(items.map((item) => item.id)).size !== items.length)
      issues.push({
        path: `${path}.items`,
        message: 'Checklist item IDs must be unique.',
      });
  }
  if (question.type === 'repeated') {
    const columns = question.columns ?? [];
    if (columns.length < 1)
      issues.push({
        path: `${path}.columns`,
        message: 'Repeated rows need at least one column.',
      });
    if (new Set(columns.map((column) => column.id)).size !== columns.length)
      issues.push({
        path: `${path}.columns`,
        message: 'Column IDs must be unique.',
      });
    columns.forEach((column, index) => {
      const columnPath = `${path}.columns.${index}`;
      if (!column.label.trim())
        issues.push({
          path: `${columnPath}.label`,
          message: 'Give every column a label.',
        });
      if (
        column.type === 'choice' &&
        (column.choices?.filter((choice) => choice.trim()).length ?? 0) < 2
      )
        issues.push({
          path: `${columnPath}.choices`,
          message: 'A choice column needs at least two options.',
        });
      issues.push(...limitIssues(column.limits, column.type, columnPath));
    });
    if (
      question.minRows !== undefined &&
      question.maxRows !== undefined &&
      question.minRows > question.maxRows
    )
      issues.push({
        path: `${path}.minRows`,
        message: 'The fewest rows must not be more than the most rows.',
      });
  }
  return issues;
}
