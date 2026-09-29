import type { RiskScale, RiskScaleSettings } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  riskScaleQuery,
  saveRiskScale,
  settingsKeys,
} from '@/features/settings/queries';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';

const axes = [
  ['probability', 'Probability', 'How likely the risk is to occur'],
  ['impact', 'Impact', 'How serious it would be if it occurred'],
] as const;

/**
 * Labels for the 1–5 points institutions use to rate probability and impact. They describe
 * the inputs only: severity stays their product, with no rating bands (O16).
 */
function RiskScaleForm({ settings }: { settings: RiskScaleSettings }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<RiskScale>(() =>
    structuredClone(settings.riskScale),
  );
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => saveRiskScale({ ...values, reason }),
    onSuccess: async (next) => {
      setValues(structuredClone(next.riskScale));
      setReason('');
      queryClient.setQueryData(settingsKeys.riskScale, next);
      // Risk registers and forms everywhere read the labels from the cycle.
      await queryClient.invalidateQueries();
    },
  });
  const errors = isApiError(save.error) ? save.error.fieldErrors : {};
  const dirty = JSON.stringify(values) !== JSON.stringify(settings.riskScale);
  return (
    <form
      className="grid grid-cols-1 gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      {save.isSuccess && !dirty && (
        <Alert>
          <AlertTitle>Risk rating scale saved</AlertTitle>
          <AlertDescription>
            Risk registers and forms now show the new labels. Ratings already
            recorded keep their numbers.
          </AlertDescription>
        </Alert>
      )}
      {save.isError && (
        <Alert variant="destructive">
          <AlertTitle>The scale was not saved</AlertTitle>
          <AlertDescription>{save.error.message}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {axes.map(([axis, title, hint]) => (
          <fieldset
            key={axis}
            className="grid content-start gap-3 rounded-lg border bg-card p-5"
          >
            <legend className="px-1 font-semibold">{title}</legend>
            <p className="text-sm text-muted-foreground">{hint}.</p>
            {values[axis].map((label, index) => (
              <div
                key={index}
                className="grid grid-cols-[1.5rem_1fr] items-center gap-2"
              >
                <Label
                  htmlFor={`scale-${axis}-${index + 1}`}
                  className="justify-end tabular-nums"
                >
                  <span className="sr-only">{title} </span>
                  {index + 1}
                </Label>
                <Input
                  id={`scale-${axis}-${index + 1}`}
                  value={label}
                  maxLength={40}
                  aria-invalid={errors[axis] ? true : undefined}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      [axis]: values[axis].map((current, position) =>
                        position === index ? event.target.value : current,
                      ),
                    })
                  }
                />
              </div>
            ))}
            {errors[axis] && (
              <p className="text-sm text-destructive">{errors[axis]}</p>
            )}
          </fieldset>
        ))}
      </div>
      <div className="grid max-w-2xl gap-1.5">
        <Label htmlFor="scale-source">Source of these labels</Label>
        <Textarea
          id="scale-source"
          value={values.source}
          onChange={(event) =>
            setValues({ ...values, source: event.target.value })
          }
          aria-describedby="scale-source-hint"
        />
        <p id="scale-source-hint" className="text-xs text-muted-foreground">
          Shown with the scale wherever risks are rated. Name the document and
          version, for example the EACC risk assessment template.
        </p>
        {errors.source && (
          <p className="text-sm text-destructive">{errors.source}</p>
        )}
      </div>
      <div className="grid max-w-2xl gap-1.5">
        <Label htmlFor="scale-reason">Reason for the change</Label>
        <Textarea
          id="scale-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div>
        <Button
          type="submit"
          disabled={!dirty || reason.trim().length < 10 || save.isPending}
        >
          Save scale
        </Button>
        {dirty && reason.trim().length < 10 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Give a reason of at least 10 characters.
          </p>
        )}
      </div>
    </form>
  );
}

export function RiskScalePage() {
  const settings = useQuery(riskScaleQuery);
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Forms & scoring"
        title="Risk rating scale"
        description="What 1 to 5 means when institutions rate a risk’s probability and impact. Severity is their product, with no rating bands."
      />
      <QueryView query={settings} label="risk rating scale">
        {(data) => (
          <div className="grid grid-cols-1 gap-8">
            <RiskScaleForm settings={data} />
            <section aria-labelledby="scale-changes-heading">
              <h2 id="scale-changes-heading" className="text-lg font-semibold">
                Change log
              </h2>
              {data.changes.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No changes since the cycle was set up.
                </p>
              ) : (
                <ul className="mt-3 grid gap-3">
                  {data.changes.map((change) => (
                    <li
                      key={change.at + change.summary}
                      className="rounded-lg border bg-card p-4 text-sm"
                    >
                      <p className="font-medium">{change.summary}</p>
                      <p className="text-muted-foreground">
                        {formatDateTime(change.at)} by {change.by}. Reason:{' '}
                        {change.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </QueryView>
    </div>
  );
}
