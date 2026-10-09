import type {
  DayCounting,
  FinancialYearInput,
  OpeningReadiness,
  Period,
} from '../draft/index.js';
import { endOfDay, localDate, shiftDays } from './days.js';

/*
 * Planning financial years (HP2-100, PRD §7.1, FR02): what the next year would be under the
 * current rules, its quarters, and what makes a planned year invalid. Pure, so the API and the
 * mock plan years identically.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "1 Jul 2027": dates in messages, the same in the API and the mock. */
export function yearDate(date: string) {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** The same day `months` later; YYYY-MM-DD, for the first of a month. */
function addMonths(date: string, months: number) {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const at = new Date(Date.UTC(year, month - 1 + months, day));
  return at.toISOString().slice(0, 10);
}

const dayBefore = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);

const dayAfter = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

/** Its identifier and name from the start date: July 2027 starts "FY 2027/28" (FY2027-28). */
export function yearNaming(startsOn: string) {
  const year = Number(startsOn.slice(0, 4));
  if (startsOn.slice(5, 7) === '01')
    return { id: `FY${year}`, label: `FY ${year}` };
  const next = String((year + 1) % 100).padStart(2, '0');
  return { id: `FY${year}-${next}`, label: `FY ${year}/${next}` };
}

/** Four quarters of three months from the start date. */
export function yearQuarters(startsOn: string) {
  return ([1, 2, 3, 4] as const).map((quarter) => ({
    quarter,
    label: `Q${quarter}`,
    startsOn: addMonths(startsOn, (quarter - 1) * 3),
    endsOn: dayBefore(addMonths(startsOn, quarter * 3)),
  }));
}

/** The last day of the year. */
export const yearEnd = (startsOn: string) => dayBefore(addMonths(startsOn, 12));

/**
 * The next year under the current rules: it starts the day after `after` ends, each deadline is
 * the deadline rule applied to its quarter's end, the foundation deadline is the end of Q1 and
 * the evaluation cutoff a month after the year ends (as FY 2026/27 is set up, PRD §9.1).
 */
export function proposeYear(
  after: { periods: Pick<Period, 'endsOn'>[] },
  counting: Pick<DayCounting, 'mode' | 'reportingDays' | 'holidays'>,
  profileId: string,
): FinancialYearInput {
  const start = dayAfter(after.periods.at(-1)!.endsOn);
  const quarters = yearQuarters(start);
  return {
    label: yearNaming(start).label,
    startsOn: start,
    deadlines: quarters.map((quarter) =>
      shiftDays(quarter.endsOn, counting.reportingDays, counting),
    ),
    foundationDeadlineDate: quarters[0]!.endsOn,
    evaluationCutoffDate: dayBefore(addMonths(start, 13)),
    profileId,
  };
}

/** The stored year: quarters with their identifiers and end-of-day deadlines. */
export function buildYear(input: FinancialYearInput) {
  const { id } = yearNaming(input.startsOn);
  const periods: Period[] = yearQuarters(input.startsOn).map((quarter) => ({
    id: `${id}-Q${quarter.quarter}`,
    ...quarter,
    submissionDeadline: endOfDay(input.deadlines[quarter.quarter - 1]!),
  }));
  return {
    id,
    label: input.label.trim(),
    startsOn: input.startsOn,
    endsOn: yearEnd(input.startsOn),
    foundationDeadline: endOfDay(input.foundationDeadlineDate),
    evaluationCutoff: endOfDay(input.evaluationCutoffDate),
    profileId: input.profileId,
    periods,
  };
}

/** The input a stored year was planned from, to edit it. */
export function yearInput(year: {
  label: string;
  startsOn: string;
  periods: Pick<Period, 'submissionDeadline'>[];
  foundationDeadline: string;
  evaluationCutoff: string;
  profileId: string;
}): FinancialYearInput {
  return {
    label: year.label,
    startsOn: year.startsOn,
    deadlines: year.periods.map((period) =>
      localDate(period.submissionDeadline),
    ),
    foundationDeadlineDate: localDate(year.foundationDeadline),
    evaluationCutoffDate: localDate(year.evaluationCutoff),
    profileId: year.profileId,
  };
}

interface KnownYear {
  id: string;
  label: string;
  status: 'planned' | 'active' | 'closed';
  startsOn: string;
  endsOn: string;
}

/**
 * Why a planned year cannot be saved, by field (`deadlines.1` is Q2). Years never overlap and
 * are planned after the active one; deadlines follow their quarters and the cutoff follows the
 * last deadline. `self` is the year being edited.
 */
export function yearIssues(
  input: FinancialYearInput,
  years: KnownYear[],
  profileIds: string[],
  self?: string,
): Record<string, string> {
  const issues: Record<string, string> = {};
  const others = years.filter((year) => year.id !== self);
  const label = input.label.trim();
  if (
    others.some(
      (year) => year.label.trim().toLowerCase() === label.toLowerCase(),
    )
  )
    issues.label = `${label} is already the name of another year.`;
  if (input.startsOn.slice(8) !== '01') {
    issues.startsOn = 'A financial year starts on the first day of a month.';
    return issues;
  }
  const endsOn = yearEnd(input.startsOn);
  const active = years.find((year) => year.status === 'active');
  if (active && input.startsOn <= active.endsOn)
    issues.startsOn = `Plan a year that starts after ${active.label} ends on ${yearDate(active.endsOn)}.`;
  const overlap = others.find(
    (year) => year.startsOn <= endsOn && year.endsOn >= input.startsOn,
  );
  if (!issues.startsOn && overlap)
    issues.startsOn = `This overlaps ${overlap.label} (${yearDate(overlap.startsOn)} to ${yearDate(overlap.endsOn)}).`;
  const planned = others.find((year) => year.status === 'planned');
  if (!issues.startsOn && planned)
    issues.startsOn = `${planned.label} is already planned. Edit or discard it first.`;

  const quarters = yearQuarters(input.startsOn);
  quarters.forEach((quarter, index) => {
    const deadline = input.deadlines[index]!;
    if (deadline <= quarter.endsOn)
      issues[`deadlines.${index}`] =
        `The ${quarter.label} deadline must be after the quarter ends on ${yearDate(quarter.endsOn)}.`;
  });
  if (
    input.foundationDeadlineDate < input.startsOn ||
    input.foundationDeadlineDate > endsOn
  )
    issues.foundationDeadlineDate = `The foundation deadline must fall within the year (${yearDate(input.startsOn)} to ${yearDate(endsOn)}).`;
  const lastDeadline = [...input.deadlines].sort().at(-1)!;
  if (input.evaluationCutoffDate <= lastDeadline)
    issues.evaluationCutoffDate = `The evaluation cutoff must be after the last quarterly deadline, ${yearDate(lastDeadline)}.`;
  if (!profileIds.includes(input.profileId))
    issues.profileId = 'Choose an approved scoring profile.';
  return issues;
}

/** What changed between two versions of a planned year, in words for the change log. */
export function summarizeYearChange(
  before: FinancialYearInput,
  after: FinancialYearInput,
  profileName: (id: string) => string,
) {
  const changes: string[] = [];
  if (before.label.trim() !== after.label.trim())
    changes.push(`Name ${before.label} → ${after.label}`);
  if (before.startsOn !== after.startsOn)
    changes.push(
      `Start ${yearDate(before.startsOn)} → ${yearDate(after.startsOn)}`,
    );
  before.deadlines.forEach((deadline, index) => {
    const next = after.deadlines[index]!;
    if (deadline !== next)
      changes.push(
        `Q${index + 1} deadline ${yearDate(deadline)} → ${yearDate(next)}`,
      );
  });
  if (before.foundationDeadlineDate !== after.foundationDeadlineDate)
    changes.push(
      `Foundation deadline ${yearDate(before.foundationDeadlineDate)} → ${yearDate(after.foundationDeadlineDate)}`,
    );
  if (before.evaluationCutoffDate !== after.evaluationCutoffDate)
    changes.push(
      `Evaluation cutoff ${yearDate(before.evaluationCutoffDate)} → ${yearDate(after.evaluationCutoffDate)}`,
    );
  if (before.profileId !== after.profileId)
    changes.push(
      `Scoring profile ${profileName(before.profileId)} → ${profileName(after.profileId)}`,
    );
  return changes;
}

/**
 * Whether the active year is complete, so the next can open (HP2-100): every institution's
 * result is published, or the evaluation cutoff has passed and the rest are left pending.
 */
export function openingReadiness(
  active: { label: string; evaluationCutoff: string },
  institutions: { id: string; name: string }[],
  publishedIds: Iterable<string>,
  businessTime: string,
): OpeningReadiness {
  const published = new Set(publishedIds);
  const pending = institutions
    .filter((institution) => !published.has(institution.id))
    .map((institution) => ({
      institutionId: institution.id,
      institutionName: institution.name,
    }));
  const cutoffPassed =
    Date.parse(businessTime) > Date.parse(active.evaluationCutoff);
  const blocker =
    pending.length > 0 && !cutoffPassed
      ? `${pending.length} of ${institutions.length} institutions have no published result for ${active.label}, and its evaluation cutoff (${yearDate(localDate(active.evaluationCutoff))}) has not passed. Publish their results, or wait for the cutoff.`
      : null;
  return {
    ready: blocker === null,
    published: institutions.length - pending.length,
    total: institutions.length,
    pending,
    cutoffPassed,
    blocker,
  };
}
