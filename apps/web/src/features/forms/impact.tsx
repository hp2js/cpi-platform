import type { FormImpact, FormPeriodImpact, Role } from '@cpi/contracts';

const roleLabels: Partial<Record<Role, [string, string]>> = {
  institution: ['institution user', 'institution users'],
  officer: ['officer', 'officers'],
  supervisor: ['supervisor', 'supervisors'],
};

const plural = (count: number, [one, many]: [string, string]) =>
  `${count} ${count === 1 ? one : many}`;

function versionName(version: number | null) {
  return version === null ? 'no version' : `version ${version}`;
}

/** One period's fate in plain words; the outcome is stated, never shown by colour alone. */
export function periodOutcome(period: FormPeriodImpact, done = false) {
  switch (period.outcome) {
    case 'moves':
      return `${done ? 'moved' : 'moves'} from version ${period.currentVersion} to version ${period.nextVersion}`;
    case 'assigned':
      return `${done ? 'got' : 'gets'} version ${period.nextVersion}, its first version`;
    case 'locked':
      return `has started reporting on version ${period.currentVersion} and cannot move`;
    case 'keeps':
      return `keeps ${versionName(period.currentVersion)}`;
  }
}

/** Who is told about a publication, e.g. "8 institution users, 2 officers and 1 supervisor". */
export function recipientSummary(impact: FormImpact) {
  const parts = impact.recipients
    .filter((recipient) => recipient.count > 0)
    .map((recipient) =>
      plural(
        recipient.count,
        roleLabels[recipient.role] ?? [recipient.role, recipient.role],
      ),
    );
  if (parts.length === 0) return 'nobody';
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/**
 * What publishing a draft would do (FR03): each period's version before and after, the
 * institutions that will report on it and who is notified. The server computes it.
 */
export function ImpactSummary({
  impact,
  done = false,
}: {
  impact: FormImpact;
  /** After publication: says what happened rather than what would. */
  done?: boolean;
}) {
  return (
    <div className="grid gap-3 text-sm">
      <ul className="grid gap-1">
        {impact.periods.map((period) => (
          <li key={period.periodId}>
            <span className="font-bold">{period.label}</span>{' '}
            {periodOutcome(period, done)}
          </li>
        ))}
      </ul>
      <p>
        {impact.institutions === 0
          ? 'No institution reports on this version yet.'
          : `${plural(impact.institutions, ['institution', 'institutions'])} ${done ? 'now report' : 'will report'} on this version.`}{' '}
        {done ? 'Notified' : 'Notified on publication'}:{' '}
        {recipientSummary(impact)}.
      </p>
      {impact.locksProfile && (
        <p>
          {done
            ? 'The cycle’s scoring profile is now locked for the cycle.'
            : 'Publishing also locks the cycle’s scoring profile for the cycle.'}
        </p>
      )}
    </div>
  );
}
