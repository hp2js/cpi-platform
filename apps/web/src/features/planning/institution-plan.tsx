import type { Amendment, Plan } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { invalidateEvents } from '@/features/events/queries';
import {
  BaselineNotes,
  BaselineStatus,
  MilestoneTable,
  RiskTable,
} from '@/features/planning/baseline-view';
import {
  invalidatePlan,
  planQuery,
  requestAmendment,
} from '@/features/planning/queries';
import { useSession } from '@/features/session/use-session';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { SelectField } from '@/components/select-field';

function latestBaselines(plan: Plan) {
  const byPeriod = new Map<string, Plan['baselines'][number]>();
  for (const baseline of plan.baselines) {
    const current = byPeriod.get(baseline.periodId);
    if (!current || baseline.version > current.version)
      byPeriod.set(baseline.periodId, baseline);
  }
  return [...byPeriod.values()].sort((a, b) =>
    a.periodId.localeCompare(b.periodId),
  );
}

/** Amendments apply only to periods that have not opened; the original baseline is kept (FR04, AT17). */
function AmendmentForm({ plan }: { plan: Plan }) {
  const queryClient = useQueryClient();
  const open = latestBaselines(plan).filter((baseline) => !baseline.locked);
  const [periodId, setPeriodId] = useState(open[0]?.periodId ?? '');
  const baseline = open.find((candidate) => candidate.periodId === periodId);
  const candidates =
    baseline?.milestones.filter((milestone) => !milestone.mandatory) ?? [];
  const [milestoneId, setMilestoneId] = useState('');
  const [change, setChange] = useState<'remove' | 'reschedule'>('reschedule');
  const later = open.filter(
    (candidate) => baseline && candidate.periodId > baseline.periodId,
  );
  const [toPeriodId, setToPeriodId] = useState('');
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      requestAmendment(plan.institutionId, {
        periodId,
        milestoneId,
        change,
        toPeriodId: change === 'reschedule' ? toPeriodId : null,
        reason,
      }),
    onSuccess: async () => {
      setReason('');
      setMilestoneId('');
      await Promise.all([
        invalidatePlan(queryClient, plan.institutionId),
        invalidateEvents(queryClient),
      ]);
    },
  });
  if (open.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No future period is open for amendment.
      </p>
    );
  const ready =
    milestoneId &&
    reason.trim().length >= 10 &&
    (change === 'remove' || toPeriodId);
  return (
    <form
      className="grid gap-4 rounded-lg border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Removing or moving a planned milestone needs a reason and your officer’s
        confirmation. It applies only to periods that have not opened, and the
        original baseline is kept. Committee meeting obligations cannot be
        removed.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="amend-period">Period</Label>
        <SelectField
          className="max-w-md"
          id="amend-period"
          value={periodId}
          onChange={(value) => {
            setPeriodId(value);
            setMilestoneId('');
          }}
          options={open.map((candidate) => ({
            value: candidate.periodId,
            label: candidate.periodLabel,
          }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="amend-milestone">Milestone</Label>
        <SelectField
          className="max-w-md"
          id="amend-milestone"
          value={milestoneId}
          onChange={setMilestoneId}
          placeholder="Choose a milestone"
          options={candidates.map((milestone) => ({
            value: milestone.id,
            label: `${milestone.code} ${milestone.title}`,
          }))}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Change</legend>
        <RadioGroup
          value={change}
          onValueChange={(value) => setChange(value as 'remove' | 'reschedule')}
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem id="change-reschedule" value="reschedule" />
            <Label htmlFor="change-reschedule" className="font-normal">
              Move to a later period
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem id="change-remove" value="remove" />
            <Label htmlFor="change-remove" className="font-normal">
              Remove
            </Label>
          </div>
        </RadioGroup>
      </fieldset>
      {change === 'reschedule' && (
        <div className="grid gap-1.5">
          <Label htmlFor="amend-target">Move to</Label>
          <SelectField
            className="max-w-md"
            id="amend-target"
            value={toPeriodId}
            onChange={setToPeriodId}
            placeholder="Choose a later period"
            options={later.map((candidate) => ({
              value: candidate.periodId,
              label: candidate.periodLabel,
            }))}
          />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="amend-reason">Reason</Label>
        <Textarea
          id="amend-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {isApiError(mutation.error)
            ? (Object.values(mutation.error.fieldErrors)[0] ??
              mutation.error.message)
            : mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p role="status" className="text-sm">
          Amendment requested. Your officer will confirm or decline it.
        </p>
      )}
      <div>
        <Button type="submit" disabled={!ready || mutation.isPending}>
          Request amendment
        </Button>
      </div>
    </form>
  );
}

function AmendmentList({ amendments }: { amendments: Amendment[] }) {
  if (amendments.length === 0) return null;
  return (
    <ul className="grid gap-2 text-sm">
      {amendments.map((amendment) => (
        <li key={amendment.id} className="rounded-md border bg-card p-3">
          <p className="font-medium">
            {amendment.change === 'remove' ? 'Remove' : 'Move'}{' '}
            {amendment.milestoneCode} ·{' '}
            {amendment.status === 'pending'
              ? 'Awaiting officer'
              : amendment.status}
          </p>
          <p className="text-muted-foreground">
            Requested {formatDateTime(amendment.requestedAt)}:{' '}
            {amendment.reason}
          </p>
          {amendment.decisionReason && (
            <p>
              {amendment.decidedBy}: {amendment.decisionReason}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The institution's plan: risks, quarterly baselines and amendments. */
export function InstitutionPlan() {
  const session = useSession();
  const institutionId = session.user.institutionId ?? '';
  const plan = useQuery(planQuery(institutionId));
  return (
    <QueryView query={plan} label="plan">
      {(data) => (
        <div className="grid gap-8">
          <p className="text-sm text-muted-foreground">
            Corruption Risk Assessment and Mitigation Plan (CRAMP):{' '}
            {data.approvedPlanReference}
          </p>
          <section aria-labelledby="risks-heading" className="grid gap-3">
            <h2 id="risks-heading" className="text-lg font-semibold">
              Risk register
            </h2>
            <RiskTable risks={data.risks} />
          </section>
          <section aria-labelledby="baselines-heading" className="grid gap-4">
            <div>
              <h2 id="baselines-heading" className="text-lg font-semibold">
                Quarterly baselines
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your implementation result for each quarter is measured against
                its approved baseline. Milestones cannot be deleted to improve a
                result; changes need an amendment before the quarter opens.
              </p>
            </div>
            {latestBaselines(data).map((baseline) => {
              const history = data.baselines.filter(
                (candidate) =>
                  candidate.periodId === baseline.periodId &&
                  candidate.version < baseline.version,
              );
              return (
                <article
                  key={baseline.id}
                  aria-labelledby={`bl-${baseline.periodId}`}
                  className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-5"
                >
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3
                      id={`bl-${baseline.periodId}`}
                      className="font-semibold"
                    >
                      {baseline.periodLabel} baseline{' '}
                      <span className="font-normal text-muted-foreground">
                        · version {baseline.version} ·{' '}
                        {baseline.milestones.length} milestones
                      </span>
                    </h3>
                    <BaselineStatus baseline={baseline} />
                  </header>
                  <MilestoneTable baseline={baseline} />
                  <BaselineNotes baseline={baseline} />
                  {history.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Earlier versions kept:{' '}
                      {history
                        .map(
                          (version) =>
                            `v${version.version} (${version.milestones.length} milestones)`,
                        )
                        .join(', ')}
                      .
                    </p>
                  )}
                </article>
              );
            })}
          </section>
          <section aria-labelledby="amend-heading" className="grid gap-3">
            <h2 id="amend-heading" className="text-lg font-semibold">
              Amendments
            </h2>
            <AmendmentList amendments={data.amendments} />
            <AmendmentForm plan={data} />
          </section>
        </div>
      )}
    </QueryView>
  );
}
