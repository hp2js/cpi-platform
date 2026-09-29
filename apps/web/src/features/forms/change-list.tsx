import type { FormChange } from '@cpi/contracts';

const kindLabels: Record<FormChange['kind'], string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  periods: 'Quarters',
};

/** A version's differences from the one it was based on, in plain words. */
export function ChangeList({ changes }: { changes: FormChange[] }) {
  const content = changes.filter((change) => change.kind !== 'periods');
  const periods = changes.find((change) => change.kind === 'periods');
  return (
    <div className="grid gap-2 text-sm">
      {content.length === 0 ? (
        <p className="text-muted-foreground">
          No changes to sections or questions.
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {content.map((change) => (
            <li key={`${change.target}-${change.id}-${change.kind}`}>
              <span className="font-medium">
                {kindLabels[change.kind]}{' '}
                {change.target === 'section' ? 'section' : 'question'}:
              </span>{' '}
              {change.label || change.id}
              {change.details.length > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  ({change.details.join('; ')})
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {periods && (
        <p className="text-muted-foreground">{periods.details.join('. ')}.</p>
      )}
    </div>
  );
}
