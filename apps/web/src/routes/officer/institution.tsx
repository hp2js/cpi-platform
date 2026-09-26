import {
  foundationChecks,
  type Baseline,
  type BaselineChecks,
  type FoundationIndicator,
  type Plan,
} from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { invalidateEvents } from '@/features/events/queries';
import {
  foundationKeys,
  foundationsQuery,
  reviewFoundation,
} from '@/features/foundations/queries';
import { VersionList } from '@/features/foundations/version-list';
import {
  BaselineNotes,
  BaselineStatus,
  MilestoneTable,
  RiskTable,
} from '@/features/planning/baseline-view';
import {
  approveBaseline,
  confirmSeed,
  decideAmendment,
  invalidatePlan,
  planQuery,
  returnBaseline,
} from '@/features/planning/queries';
import { ComponentScoreValue } from '@/features/review/score-display';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';

const route = getRouteApi('/authed/officer/institutions/$institutionId');

const checkLabels: Record<keyof BaselineChecks, string> = {
  materialCoverage: 'Milestones cover the material risks in the approved plan',
  objectiveConditions: 'Each milestone has an objective completion condition',
  mandatoryObligations:
    'The quarterly CPC and IAO meeting obligations are included',
  noFragmentation: 'No duplicate, trivial or artificially split milestones',
};

function usePlanMutation<T>(
  institutionId: string,
  action: (value: T) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () =>
      Promise.all([
        invalidatePlan(queryClient, institutionId),
        invalidateEvents(queryClient),
      ]),
  });
}

/** Baseline approval with the anti-gaming rationale from PRD §10.4 and §10.7 (AT25, AT31). */
function ApprovalPanel({ baseline }: { baseline: Baseline }) {
  const [checks, setChecks] = useState<BaselineChecks>({
    materialCoverage: false,
    objectiveConditions: false,
    mandatoryObligations: false,
    noFragmentation: false,
  });
  const [rationale, setRationale] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const approve = usePlanMutation(baseline.institutionId, () =>
    approveBaseline(baseline.id, baseline.version, rationale, checks),
  );
  const giveBack = usePlanMutation(baseline.institutionId, () =>
    returnBaseline(baseline.id, baseline.version, returnReason),
  );
  const committee = baseline.milestones.filter(
    (milestone) => milestone.mandatory,
  ).length;
  const byRisk = new Map<string, number>();
  for (const milestone of baseline.milestones)
    byRisk.set(milestone.risk, (byRisk.get(milestone.risk) ?? 0) + 1);
  const large = baseline.milestones.length > 6;
  const allChecked = Object.values(checks).every(Boolean);
  return (
    <div className="grid gap-4 rounded-md border bg-background p-4">
      <h4 className="font-medium">Approve or return this proposal</h4>
      <dl className="grid gap-1 text-sm sm:grid-cols-[12rem_1fr]">
        <dt className="text-muted-foreground">Plan size</dt>
        <dd>
          {baseline.milestones.length} milestones, of which {committee}{' '}
          committee obligation{committee === 1 ? '' : 's'} (
          {Math.round(
            (committee / Math.max(1, baseline.milestones.length)) * 100,
          )}
          % of the denominator)
        </dd>
        <dt className="text-muted-foreground">Milestones per risk</dt>
        <dd>
          {[...byRisk.entries()].map(([risk, count]) => (
            <span key={risk} className="block">
              {risk}: {count}
            </span>
          ))}
        </dd>
      </dl>
      {large && (
        <p className="flex items-start gap-2 text-sm font-medium">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          This proposal is large. Check for duplicate, trivial or artificially
          split milestones: they would inflate the result and shrink the
          committee obligations’ share.
        </p>
      )}
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Confirm each check</legend>
        {(Object.keys(checkLabels) as (keyof BaselineChecks)[]).map((key) => (
          <div key={key} className="flex items-start gap-2">
            <Checkbox
              id={`${baseline.id}-${key}`}
              checked={checks[key]}
              onCheckedChange={(checked) =>
                setChecks((current) => ({
                  ...current,
                  [key]: checked === true,
                }))
              }
              className="mt-0.5"
            />
            <Label
              htmlFor={`${baseline.id}-${key}`}
              className="leading-snug font-normal"
            >
              {checkLabels[key]}
            </Label>
          </div>
        ))}
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor={`${baseline.id}-rationale`}>
          Rationale (kept for audit)
        </Label>
        <Textarea
          id={`${baseline.id}-rationale`}
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
        />
      </div>
      {approve.isError && (
        <p role="alert" className="text-sm text-destructive">
          {approve.error.message}
        </p>
      )}
      <div>
        <Button
          disabled={
            !allChecked || rationale.trim().length < 20 || approve.isPending
          }
          onClick={() => approve.mutate(undefined)}
        >
          Approve and activate
        </Button>
        {(!allChecked || rationale.trim().length < 20) && (
          <p className="mt-1 text-xs text-muted-foreground">
            Confirm all four checks and give a rationale of at least 20
            characters.
          </p>
        )}
      </div>
      <div className="grid gap-1.5 border-t pt-4">
        <Label htmlFor={`${baseline.id}-return`}>
          Or return it to the institution with feedback
        </Label>
        <Textarea
          id={`${baseline.id}-return`}
          value={returnReason}
          onChange={(event) => setReturnReason(event.target.value)}
        />
        {giveBack.isError && (
          <p role="alert" className="text-sm text-destructive">
            {giveBack.error.message}
          </p>
        )}
        <div>
          <Button
            variant="outline"
            disabled={returnReason.trim().length < 10 || giveBack.isPending}
            onClick={() => giveBack.mutate(undefined)}
          >
            Return for revision
          </Button>
        </div>
      </div>
    </div>
  );
}

function SeedConfirmation({ baseline }: { baseline: Baseline }) {
  const confirm = usePlanMutation(baseline.institutionId, () =>
    confirmSeed(baseline.id, baseline.version),
  );
  return (
    <div className="grid gap-2 rounded-md border bg-background p-4 text-sm">
      <p>
        This baseline was seeded for the simulated year. Confirm that its
        milestones correspond to the fictional approved plan before finalizing
        any {baseline.periodLabel} result. The confirmation time is recorded as
        now; nothing is backdated.
      </p>
      {confirm.isError && (
        <p role="alert" className="text-destructive">
          {confirm.error.message}
        </p>
      )}
      <div>
        <Button
          variant="outline"
          disabled={confirm.isPending}
          onClick={() => confirm.mutate(undefined)}
        >
          Confirm correspondence with the approved plan
        </Button>
      </div>
    </div>
  );
}

function Baselines({ plan }: { plan: Plan }) {
  const latest = new Map<string, Baseline>();
  for (const baseline of plan.baselines)
    if ((latest.get(baseline.periodId)?.version ?? 0) < baseline.version)
      latest.set(baseline.periodId, baseline);
  return (
    <div className="grid gap-4">
      {[...latest.values()].map((baseline) => (
        <article
          key={baseline.id}
          aria-labelledby={`obl-${baseline.periodId}`}
          className="grid gap-3 rounded-lg border bg-card p-5"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`obl-${baseline.periodId}`} className="font-semibold">
              {baseline.periodLabel}{' '}
              <span className="font-normal text-muted-foreground">
                · version {baseline.version}
              </span>
            </h3>
            <BaselineStatus baseline={baseline} />
          </header>
          <MilestoneTable baseline={baseline} />
          <BaselineNotes baseline={baseline} />
          {baseline.historicalSeed && !baseline.historicalSeed.confirmedAt && (
            <SeedConfirmation baseline={baseline} />
          )}
          {baseline.status === 'proposed' && (
            <ApprovalPanel baseline={baseline} />
          )}
        </article>
      ))}
    </div>
  );
}

function Amendments({ plan }: { plan: Plan }) {
  const pending = plan.amendments.filter(
    (amendment) => amendment.status === 'pending',
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const decide = usePlanMutation(
    plan.institutionId,
    ({ id, decision }: { id: string; decision: 'confirmed' | 'declined' }) =>
      decideAmendment(id, decision, reasons[id] ?? ''),
  );
  if (plan.amendments.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No amendments have been requested.
      </p>
    );
  return (
    <ul className="grid gap-3">
      {plan.amendments.map((amendment) => (
        <li
          key={amendment.id}
          className="grid gap-2 rounded-lg border bg-card p-4 text-sm"
        >
          <p className="font-medium">
            {amendment.change === 'remove' ? 'Remove' : 'Move'}{' '}
            {amendment.milestoneCode}
            {amendment.toPeriodId
              ? ` to ${amendment.toPeriodId.slice(-2)}`
              : ''}{' '}
            ·{' '}
            {amendment.status === 'pending'
              ? 'awaiting your decision'
              : amendment.status}
          </p>
          <p className="text-muted-foreground">
            {amendment.requestedBy}, {formatDateTime(amendment.requestedAt)}:{' '}
            {amendment.reason}
          </p>
          {pending.includes(amendment) && (
            <div className="grid gap-2">
              <Label htmlFor={`amd-${amendment.id}`}>Decision reason</Label>
              <Textarea
                id={`amd-${amendment.id}`}
                value={reasons[amendment.id] ?? ''}
                onChange={(event) =>
                  setReasons((current) => ({
                    ...current,
                    [amendment.id]: event.target.value,
                  }))
                }
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={
                    (reasons[amendment.id] ?? '').trim().length < 10 ||
                    decide.isPending
                  }
                  onClick={() =>
                    decide.mutate({ id: amendment.id, decision: 'confirmed' })
                  }
                >
                  Confirm: new baseline version
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    (reasons[amendment.id] ?? '').trim().length < 10 ||
                    decide.isPending
                  }
                  onClick={() =>
                    decide.mutate({ id: amendment.id, decision: 'declined' })
                  }
                >
                  Decline
                </Button>
              </div>
            </div>
          )}
          {amendment.decisionReason && (
            <p>
              {amendment.decidedBy}: {amendment.decisionReason}
            </p>
          )}
        </li>
      ))}
      {decide.isError && (
        <li role="alert" className="text-sm text-destructive">
          {decide.error.message}
        </li>
      )}
    </ul>
  );
}

/** Four checks per foundation indicator; each pass cites a passage, each fail gives a reason (§10.3). */
function FoundationReview({
  institutionId,
  indicator,
}: {
  institutionId: string;
  indicator: FoundationIndicator;
}) {
  const queryClient = useQueryClient();
  const active = indicator.versions.find(
    (version) => version.status === 'active',
  );
  const existing =
    indicator.review && indicator.review.versionId === active?.id
      ? indicator.review.checks
      : undefined;
  const [checks, setChecks] = useState(
    existing ??
      foundationChecks[indicator.kind].map(() => ({
        outcome: '' as 'pass' | 'fail' | '',
        passage: '',
        reason: '',
      })),
  );
  const mutation = useMutation({
    mutationFn: () =>
      reviewFoundation(institutionId, indicator.kind, {
        versionId: active!.id,
        checks: checks.map((check) => ({
          outcome: check.outcome as 'pass' | 'fail',
          passage: check.passage,
          reason: check.reason,
        })),
      }),
    onSuccess: (next) =>
      queryClient.setQueryData(foundationKeys.all(institutionId), next),
  });
  const errors = isApiError(mutation.error) ? mutation.error.fieldErrors : {};
  const update = (index: number, patch: Partial<(typeof checks)[number]>) =>
    setChecks((current) =>
      current.map((check, i) => (i === index ? { ...check, ...patch } : check)),
    );
  if (!active)
    return (
      <p className="text-sm">
        No active version: no current credit can be given for this indicator.
      </p>
    );
  return (
    <div className="grid gap-3">
      {foundationChecks[indicator.kind].map((label, index) => {
        const check = checks[index]!;
        const id = `${indicator.kind}-${index}`;
        return (
          <fieldset
            key={label}
            className="grid gap-2 rounded-md border bg-background p-3"
          >
            <legend className="px-1 text-sm font-medium">
              {index + 1}. {label}
              <span className="ml-2 font-normal text-muted-foreground">
                {active.claimedChecks[index] ? '(claimed)' : '(not claimed)'}
              </span>
            </legend>
            <RadioGroup
              value={check.outcome}
              onValueChange={(value) =>
                update(index, { outcome: value as 'pass' | 'fail' })
              }
              className="flex flex-wrap gap-x-6 gap-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-pass`} value="pass" />
                <Label htmlFor={`${id}-pass`} className="font-normal">
                  Met
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-fail`} value="fail" />
                <Label htmlFor={`${id}-fail`} className="font-normal">
                  Not met
                </Label>
              </div>
            </RadioGroup>
            {check.outcome === 'pass' && (
              <div className="grid gap-1">
                <Label htmlFor={`${id}-passage`}>
                  Supporting page or section
                </Label>
                <Input
                  id={`${id}-passage`}
                  value={check.passage}
                  onChange={(event) =>
                    update(index, { passage: event.target.value })
                  }
                  className="max-w-sm"
                />
                {errors[`checks.${index}.passage`] && (
                  <p className="text-sm text-destructive">
                    {errors[`checks.${index}.passage`]}
                  </p>
                )}
              </div>
            )}
            {check.outcome === 'fail' && (
              <div className="grid gap-1">
                <Label htmlFor={`${id}-reason`}>Why it is not met</Label>
                <Textarea
                  id={`${id}-reason`}
                  value={check.reason}
                  onChange={(event) =>
                    update(index, { reason: event.target.value })
                  }
                />
                {errors[`checks.${index}.reason`] && (
                  <p className="text-sm text-destructive">
                    {errors[`checks.${index}.reason`]}
                  </p>
                )}
              </div>
            )}
          </fieldset>
        );
      })}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <div>
        <Button
          disabled={
            checks.some((check) => !check.outcome) || mutation.isPending
          }
          onClick={() => mutation.mutate()}
        >
          Save review of version {active.version}
        </Button>
      </div>
    </div>
  );
}

function Foundations({ institutionId }: { institutionId: string }) {
  const foundations = useQuery(foundationsQuery(institutionId));
  return (
    <QueryView query={foundations} label="foundation documents">
      {(data) => (
        <div className="grid gap-4">
          {data.indicators.map((indicator) => (
            <section
              key={indicator.kind}
              aria-labelledby={`of-${indicator.kind}`}
              className="grid gap-4 rounded-lg border bg-card p-5"
            >
              <h3 id={`of-${indicator.kind}`} className="text-lg font-semibold">
                {indicator.label}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  · up to {indicator.maxPoints} points
                </span>
              </h3>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-md bg-muted/60 p-4">
                  <dt className="text-sm font-medium">
                    Provisional (claimed checks with a document)
                  </dt>
                  <dd className="mt-1">
                    {indicator.provisional && (
                      <ComponentScoreValue
                        score={indicator.provisional}
                        unit="checks"
                      />
                    )}
                  </dd>
                </div>
                <div className="rounded-md bg-accent p-4">
                  <dt className="text-sm font-medium">
                    Reviewed (your accepted checks)
                  </dt>
                  <dd className="mt-1">
                    {indicator.reviewed && (
                      <ComponentScoreValue
                        score={indicator.reviewed}
                        unit="checks"
                      />
                    )}
                  </dd>
                </div>
              </dl>
              <VersionList indicator={indicator} />
              <FoundationReview
                key={
                  indicator.versions.find(
                    (version) => version.status === 'active',
                  )?.id ?? 'none'
                }
                institutionId={institutionId}
                indicator={indicator}
              />
            </section>
          ))}
        </div>
      )}
    </QueryView>
  );
}

export function OfficerInstitutionPage() {
  const { institutionId } = route.useParams();
  const plan = useQuery(planQuery(institutionId));
  const pendingAmendments =
    plan.data?.amendments.filter((amendment) => amendment.status === 'pending')
      .length ?? 0;
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={institutionId}
        title={plan.data?.institutionName ?? 'Institution'}
        description={plan.data?.approvedPlanReference}
      />
      <Tabs defaultValue="baselines" className="grid gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="baselines">Baselines</TabsTrigger>
          <TabsTrigger value="amendments">
            Amendments{pendingAmendments ? ` (${pendingAmendments})` : ''}
          </TabsTrigger>
          <TabsTrigger value="foundations">Foundations</TabsTrigger>
          <TabsTrigger value="risks">Risks</TabsTrigger>
        </TabsList>
        <TabsContent value="baselines">
          <QueryView query={plan} label="baselines">
            {(data) => <Baselines plan={data} />}
          </QueryView>
        </TabsContent>
        <TabsContent value="amendments">
          <QueryView query={plan} label="amendments">
            {(data) => <Amendments plan={data} />}
          </QueryView>
        </TabsContent>
        <TabsContent value="foundations">
          <Foundations institutionId={institutionId} />
        </TabsContent>
        <TabsContent value="risks">
          <QueryView query={plan} label="risks">
            {(data) => <RiskTable risks={data.risks} />}
          </QueryView>
        </TabsContent>
      </Tabs>
    </div>
  );
}
