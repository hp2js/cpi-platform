import type {
  CalendarSettings,
  ClockBoundary,
  Cycle,
  FormIssue,
  FormVersion,
  ScoringProfile,
} from '@cpi/contracts';

/*
 * Reporting-cycle rules (PRD §7.1, FR02, FR03), ported from the mock API's services. Pure
 * functions: the controllers load what they need and pass it in.
 */

export type Profile = Omit<ScoringProfile, 'issues'>;
export type Reminders = { daysBefore: number[]; overdueNotice: boolean };

/** The profile locks with the cycle's first published form version (§7.1). */
export function profileLockReason(forms: FormVersion[]) {
  const first = forms
    .filter((form) => form.status === 'published')
    .sort((a, b) => a.version - b.version)[0];
  return first
    ? `Locked since form version ${first.version} was published. A different profile needs a new simulation run (PRD §7.1).`
    : null;
}

/** Problems that block approval or use; empty when the profile is valid. */
export function profileIssues(profile: Profile, profiles: Profile[]) {
  const issues: FormIssue[] = [];
  const { weights } = profile;
  const total =
    weights.procedures +
    weights.riskAssessment +
    weights.mitigationPlan +
    weights.implementation;
  if (total !== 100)
    issues.push({
      path: 'weights',
      message: `Indicator weights must total 100; they total ${total}.`,
    });
  if (profile.proceduresMode === 'prerequisite' && weights.procedures !== 0)
    issues.push({
      path: 'weights.procedures',
      message:
        'When procedures are a prerequisite they carry no points; set the weight to 0.',
    });
  if (profile.proceduresMode === 'scored' && weights.procedures === 0)
    issues.push({
      path: 'weights.procedures',
      message:
        'Scored procedures need a weight above 0, or make them a prerequisite.',
    });
  if (weights.implementation === 0)
    issues.push({
      path: 'weights.implementation',
      message: 'Implementation needs a weight above 0.',
    });
  for (const [key, checks] of Object.entries(profile.checklists)) {
    if (new Set(checks.map((check) => check.toLowerCase())).size !== 4)
      issues.push({
        path: `checklists.${key}`,
        message: 'Each of the four checks must be different.',
      });
  }
  if (
    profiles.some(
      (other) =>
        other.id !== profile.id &&
        other.name.trim().toLowerCase() === profile.name.trim().toLowerCase(),
    )
  )
    issues.push({
      path: 'name',
      message: 'Another profile already has this name.',
    });
  return issues;
}

/** The latest published version assigned to a period; open periods keep theirs (§7.1). */
export function publishedFormForPeriod(forms: FormVersion[], periodId: string) {
  return forms
    .filter(
      (form) =>
        form.status === 'published' && form.periodIds.includes(periodId),
    )
    .sort((a, b) => b.version - a.version)[0];
}

/** A period is locked to its version once reporting has opened or started on it. */
export function periodLocked(
  context: {
    forms: FormVersion[];
    cycle: Cycle;
    businessTime: string;
    startedPeriodIds: Set<string>;
  },
  periodId: string,
) {
  if (!publishedFormForPeriod(context.forms, periodId)) return false;
  const period = context.cycle.periods.find(
    (candidate) => candidate.id === periodId,
  );
  const reportingOpen = period
    ? Date.parse(context.businessTime) >
      Date.parse(`${period.endsOn}T23:59:59+03:00`)
    : false;
  return reportingOpen || context.startedPeriodIds.has(periodId);
}

/** Publication rules from FR03 and AT03; each issue points to the field to fix. */
export function validateForm(
  form: FormVersion,
  context: Parameters<typeof periodLocked>[0] & {
    profile: Profile;
    profiles: Profile[];
  },
): FormIssue[] {
  const issues: FormIssue[] = [];
  if (!form.title.trim())
    issues.push({ path: 'title', message: 'Give the form a title.' });

  // Weights come from the cycle's scoring profile, which must be approved and valid (§7.1).
  const { profile } = context;
  if (
    profile.status !== 'approved' ||
    profileIssues(profile, context.profiles).length
  )
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
    ? context.forms.find(
        (candidate) => candidate.version === form.basedOnVersion,
      )
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
    if (periodLocked(context, periodId)) {
      const label =
        context.cycle.periods.find((period) => period.id === periodId)?.label ??
        periodId;
      issues.push({
        path: 'periodIds',
        message: `${label} has started reporting on its assigned version and cannot move to a new one.`,
      });
    }
  }
  const covered = new Set([
    ...context.forms
      .filter((candidate) => candidate.status === 'published')
      .flatMap((candidate) => candidate.periodIds),
    ...form.periodIds,
  ]);
  const uncovered = context.cycle.periods
    .filter((period) => !covered.has(period.id))
    .map((period) => period.label);
  if (uncovered.length)
    issues.push({
      path: 'periodIds',
      message: `Every period needs a form. Not yet assigned: ${uncovered.join(', ')}.`,
    });
  return issues;
}

/* Clock boundaries (FR14) */

const DAY = 86_400_000;
const iso = (ms: number) =>
  `${new Date(ms + 3 * 3_600_000).toISOString().slice(0, 19)}+03:00`;

export function boundaries(
  cycle: Cycle,
  reminders: Reminders,
): Omit<ClockBoundary, 'passed'>[] {
  const list: Omit<ClockBoundary, 'passed'>[] = [];
  for (const period of cycle.periods) {
    const deadline = Date.parse(period.submissionDeadline);
    const opens = Date.parse(`${period.endsOn}T23:59:59+03:00`) + 1000;
    list.push({
      id: `${period.label}-open`,
      label: `${period.label} reporting opens`,
      at: iso(opens),
      kind: 'reporting_open',
    });
    // The reminder schedule is an administrator setting (FR02; PRD §9.1 defaults 7 and 1).
    for (const days of reminders.daysBefore) {
      list.push({
        id: `${period.label}-reminder-${days}`,
        label: `${period.label} reminder: ${days} ${days === 1 ? 'day' : 'days'} to deadline`,
        at: iso(deadline - days * DAY),
        kind: 'reminder',
      });
    }
    list.push({
      id: `${period.label}-due`,
      label: `${period.label} deadline (last on-time second)`,
      at: period.submissionDeadline,
      kind: 'deadline',
    });
    list.push({
      id: `${period.label}-overdue`,
      label: `${period.label} overdue`,
      at: iso(deadline + 1000),
      kind: 'overdue',
    });
  }
  const cutoff = Date.parse(cycle.evaluationCutoff);
  list.push({
    id: 'evaluation-cutoff',
    label: 'Evaluation cutoff passes',
    at: iso(cutoff + 1000),
    kind: 'cutoff',
  });
  list.push({
    id: 'publication',
    label: 'Annual publication window',
    at: iso(cutoff + 1000 + 9 * 3_600_000),
    kind: 'publication',
  });
  return list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/* Reporting calendar (FR02) */

export const endOfDay = (date: string) => `${date}T23:59:59+03:00`;
const dateOf = (instant: string) => instant.slice(0, 10);
const opensAt = (endsOn: string) =>
  Date.parse(`${endsOn}T23:59:59+03:00`) + 1000;
export const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

export function calendarSettings(
  cycle: Cycle,
  businessTime: string,
  reminders: Reminders,
  changes: CalendarSettings['changes'],
): CalendarSettings {
  const now = Date.parse(businessTime);
  return {
    cycleId: cycle.id,
    label: cycle.label,
    timezone: cycle.timezone,
    periods: cycle.periods.map((period) => {
      const opened = now >= opensAt(period.endsOn);
      return {
        id: period.id,
        label: period.label,
        startsOn: period.startsOn,
        endsOn: period.endsOn,
        deadlineDate: dateOf(period.submissionDeadline),
        lock: opened
          ? {
              editable: false,
              reason: `${period.label} reporting has opened, so its deadline is fixed; lateness cannot be changed retroactively (FR02).`,
            }
          : { editable: true, reason: null },
      };
    }),
    foundationDeadlineDate: dateOf(cycle.foundationDeadline),
    foundationLock:
      now > Date.parse(cycle.foundationDeadline)
        ? {
            editable: false,
            reason:
              'The foundation deadline has passed, so it is fixed (FR02).',
          }
        : { editable: true, reason: null },
    evaluationCutoffDate: dateOf(cycle.evaluationCutoff),
    cutoffLock:
      now > Date.parse(cycle.evaluationCutoff)
        ? {
            editable: false,
            reason: 'The evaluation cutoff has passed, so it is fixed.',
          }
        : { editable: true, reason: null },
    reminders,
    changes,
  };
}
