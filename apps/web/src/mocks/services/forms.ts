import type { FormIssue, FormVersion } from '@cpi/contracts';
import { getDb } from '../db';

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

  const total =
    form.weights.procedures +
    form.weights.riskAssessment +
    form.weights.mitigationPlan +
    form.weights.implementation;
  if (total !== 100)
    issues.push({
      path: 'weights',
      message: `Indicator weights must total 100; they total ${total}.`,
    });
  const locked = db.forms.find((candidate) => candidate.status === 'published');
  if (
    locked &&
    JSON.stringify(locked.weights) !== JSON.stringify(form.weights)
  ) {
    issues.push({
      path: 'weights',
      message:
        'Weights are locked for this cycle once the first form is published.',
    });
  }

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
