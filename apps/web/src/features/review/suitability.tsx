import {
  suitabilityCheckKeys,
  suitabilityCheckLabels,
  type EvidenceItem,
  type EvidenceSuitability,
  type ReviewBundle,
  type SuitabilityChecks,
} from '@cpi/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { FileViewer } from '@/features/files/file-viewer';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { recordSuitability, reviewKeys } from './queries';

type Outcome = SuitabilityChecks['institution']['outcome'];
const outcomeLabel: Record<Outcome, string> = {
  pass: 'Pass',
  deficient: 'Deficient',
  not_applicable: 'Not applicable',
};

type CheckKey = (typeof suitabilityCheckKeys)[number];
/** Checks being recorded: nothing is pre-selected, so a file is never passed by default (§11). */
type DraftChecks = Record<
  CheckKey,
  { outcome: Outcome | null; reason: string }
>;

const unanswered = (): DraftChecks =>
  Object.fromEntries(
    suitabilityCheckKeys.map((key) => [key, { outcome: null, reason: '' }]),
  ) as DraftChecks;

const allPass = (): SuitabilityChecks =>
  Object.fromEntries(
    suitabilityCheckKeys.map((key) => [key, { outcome: 'pass', reason: '' }]),
  ) as SuitabilityChecks;

/** Plain status for a file, used beside citations and in the section. */
export function suitabilityStatus(record: EvidenceSuitability | undefined) {
  if (!record) return { label: 'Suitability not checked', tone: 'pending' };
  return record.deficient
    ? { label: 'Deficient: cannot support a claim', tone: 'deficient' }
    : { label: 'Suitable', tone: 'suitable' };
}

function FileChecks({
  bundle,
  item,
  record,
}: {
  bundle: ReviewBundle;
  item: EvidenceItem;
  record: EvidenceSuitability | undefined;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(!record);
  const [checks, setChecks] = useState<DraftChecks>(
    () => record?.checks ?? unanswered(),
  );
  const [showMissing, setShowMissing] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const missing = suitabilityCheckKeys.filter(
    (key) => checks[key].outcome === null,
  );
  const save = useMutation({
    mutationFn: (next: SuitabilityChecks) =>
      recordSuitability(
        bundle.submissionId,
        item.id,
        bundle.item.revision,
        next,
      ),
    onSuccess: (next) => {
      queryClient.setQueryData(reviewKeys.detail(bundle.submissionId), next);
      setEditing(false);
    },
  });
  const errors = isApiError(save.error) ? save.error.fieldErrors : {};
  const status = suitabilityStatus(record);
  const citedBy = bundle.milestones
    .filter((milestone) =>
      bundle.answers.milestones[milestone.id]?.evidence.some(
        (reference) => reference.evidenceId === item.id,
      ),
    )
    .map((milestone) => milestone.code);
  const idBase = `suit-${item.id}`;

  return (
    <li className="grid gap-3 rounded-lg border border-base-lighter bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <FileViewer file={item} />
          <span className="block text-base-dark">
            Cited by {citedBy.join(', ') || 'no milestone'}
          </span>
        </div>
        <Badge
          variant={
            status.tone === 'deficient'
              ? 'destructive'
              : status.tone === 'suitable'
                ? 'secondary'
                : 'outline'
          }
        >
          {status.label}
        </Badge>
      </div>

      {record && !editing && (
        <div className="grid gap-1 text-sm">
          <ul className="grid gap-1">
            {suitabilityCheckKeys.map((key) => (
              <li key={key}>
                {suitabilityCheckLabels[key]}:{' '}
                <span className="font-bold">
                  {outcomeLabel[record.checks[key].outcome]}
                </span>
                {record.checks[key].reason && ` · ${record.checks[key].reason}`}
              </li>
            ))}
          </ul>
          <p className="text-base-dark">
            Recorded by {record.recordedBy}, {formatDateTime(record.recordedAt)}
          </p>
          {bundle.canDecide && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                Change checks
                <span className="sr-only"> for {item.fileName}</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {bundle.canDecide && editing && (
        <form
          className="grid gap-3"
          ref={form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (missing.length > 0) {
              setShowMissing(true);
              form.current
                ?.querySelector<HTMLElement>(
                  `#${idBase}-${missing[0]} [role=radio]`,
                )
                ?.focus();
              return;
            }
            save.mutate(checks as SuitabilityChecks);
          }}
        >
          {!record && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={save.isPending}
                onClick={() => save.mutate(allPass())}
              >
                All five checks pass
                <span className="sr-only"> for {item.fileName}</span>
              </Button>
              <span className="text-sm text-base-dark">
                or record each check below.
              </span>
            </div>
          )}
          {suitabilityCheckKeys.map((key) => {
            const check = checks[key];
            const unset = showMissing && check.outcome === null;
            return (
              <fieldset
                key={key}
                id={`${idBase}-${key}`}
                aria-describedby={unset ? `${idBase}-${key}-error` : undefined}
                className={cn(
                  'grid gap-2',
                  // usa-form-group--error
                  unset && 'border-l-4 border-error-dark pl-4',
                )}
              >
                <legend className="text-sm font-bold">
                  {suitabilityCheckLabels[key]}
                </legend>
                {unset && (
                  <p
                    id={`${idBase}-${key}-error`}
                    className="text-sm font-bold text-error-dark"
                  >
                    Choose Pass, Deficient or Not applicable
                  </p>
                )}
                <RadioGroup
                  className="flex flex-wrap gap-x-4"
                  value={check.outcome ?? ''}
                  onValueChange={(value) =>
                    setChecks({
                      ...checks,
                      [key]: { ...check, outcome: value as Outcome },
                    })
                  }
                >
                  {(Object.keys(outcomeLabel) as Outcome[]).map((outcome) => (
                    <div
                      key={outcome}
                      className="flex min-h-touch items-center gap-2"
                    >
                      <RadioGroupItem
                        id={`${idBase}-${key}-${outcome}`}
                        value={outcome}
                      />
                      <Label
                        htmlFor={`${idBase}-${key}-${outcome}`}
                        className="font-normal"
                      >
                        {outcomeLabel[outcome]}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {check.outcome !== null && check.outcome !== 'pass' && (
                  <>
                    <Label
                      htmlFor={`${idBase}-${key}-reason`}
                      className="sr-only"
                    >
                      Reason: {suitabilityCheckLabels[key]}
                    </Label>
                    <Textarea
                      id={`${idBase}-${key}-reason`}
                      placeholder="Reason (at least 10 characters)"
                      value={check.reason}
                      onChange={(event) =>
                        setChecks({
                          ...checks,
                          [key]: { ...check, reason: event.target.value },
                        })
                      }
                    />
                    {errors[`checks.${key}.reason`] && (
                      <p className="text-sm font-bold text-error-dark">
                        {errors[`checks.${key}.reason`]}
                      </p>
                    )}
                  </>
                )}
              </fieldset>
            );
          })}
          {save.isError && (
            <p role="alert" className="text-sm text-error-dark">
              {save.error.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={save.isPending}>
              Save checks
              <span className="sr-only"> for {item.fileName}</span>
            </Button>
            {record && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setChecks(record.checks);
                  setShowMissing(false);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </li>
  );
}

/**
 * Evidence suitability (PRD §9.2, AT30). Each relied-on file is checked once per version; a
 * deficient file stays on record but cannot support reviewed credit. This is an evidence
 * finding, not an allegation of fraud.
 */
export function SuitabilitySection({ bundle }: { bundle: ReviewBundle }) {
  if (!bundle.evidence.length) return null;
  return (
    <section aria-labelledby="suitability-heading" className="grid gap-3">
      <h2 id="suitability-heading" className="text-lg font-bold">
        Evidence suitability
      </h2>
      <p className="max-w-measure text-sm text-base-dark">
        Check each file before relying on it. A file that fails a check stays on
        record but cannot support an accepted claim. A deficiency is an evidence
        finding, not an allegation of fraud.
      </p>
      <ul className="grid gap-3">
        {bundle.evidence.map((item) => (
          <FileChecks
            key={item.id}
            bundle={bundle}
            item={item}
            record={bundle.suitability.find(
              (record) => record.evidenceId === item.id,
            )}
          />
        ))}
      </ul>
    </section>
  );
}
