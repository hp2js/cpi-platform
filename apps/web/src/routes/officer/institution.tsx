import { QuarterDispositions } from '@/features/annual/quarter-dispositions';
import { OfficerAssignment } from '@/features/supervision/officer-assignment';
import {
  type Baseline,
  type BaselineCheck,
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
  EQUAL_WEIGHTS_NOTE,
  checkKeys,
  checkLabels,
  failedCheckLabels,
  latestBaselines,
  riskCoverage,
} from '@/features/planning/labels';
import {
  ActivityTable,
  PlanApprovalRecord,
} from '@/features/planning/plan-editor';
import {
  approveBaseline,
  confirmSeed,
  decideAmendment,
  invalidatePlan,
  planKeys,
  planQuery,
  returnBaseline,
} from '@/features/planning/queries';
import { ComponentScoreValue } from '@/features/review/score-display';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';

const route = getRouteApi('/authed/officer/institutions/$institutionId');

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
function ApprovalPanel({ plan, baseline }: { plan: Plan; baseline: Baseline }) {
  const [checks, setChecks] = useState<BaselineChecks>({
    materialCoverage: false,
    objectiveConditions: false,
    mandatoryObligations: false,
    noFragmentation: false,
  });
  const [rationale, setRationale] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [failed, setFailed] = useState<BaselineCheck[]>([]);
  const approve = usePlanMutation(baseline.institutionId, () =>
    approveBaseline(baseline.id, baseline.version, rationale, checks),
  );
  const giveBack = usePlanMutation(baseline.institutionId, () =>
    returnBaseline(baseline.id, baseline.version, returnReason, failed),
  );
  const committee = baseline.milestones.filter(
    (milestone) => milestone.mandatory,
  ).length;
  const coverage = riskCoverage(plan, baseline.milestones);
  const uncovered = coverage.risks.filter((item) => item.milestones === 0);
  const large = baseline.milestones.length > 6;
  const allChecked = Object.values(checks).every(Boolean);
  return (
    <div className="grid gap-4 rounded-md border bg-white p-4">
      <h4 className="font-bold">Approve or return this proposal</h4>
      <dl className="grid gap-1 text-sm tablet:grid-cols-[12rem_1fr]">
        <dt className="text-base-dark">Plan size</dt>
        <dd>
          {baseline.milestones.length} milestones, of which {committee}{' '}
          committee obligation{committee === 1 ? '' : 's'} (
          {Math.round(
            (committee / Math.max(1, baseline.milestones.length)) * 100,
          )}
          % of the denominator)
        </dd>
        <dt className="text-base-dark">Weights</dt>
        <dd>{EQUAL_WEIGHTS_NOTE}</dd>
        <dt className="text-base-dark">Risk coverage</dt>
        <dd>
          {coverage.risks.length === 0 ? (
            'The institution has not recorded any risks.'
          ) : (
            <ul>
              {coverage.risks.map(({ risk, milestones }) => (
                <li key={risk.id}>
                  {risk.code} {risk.description} (severity {risk.severity}):{' '}
                  {milestones === 0 ? (
                    <strong>no milestone this quarter</strong>
                  ) : (
                    `${milestones} ${milestones === 1 ? 'milestone' : 'milestones'}`
                  )}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
      {uncovered.length > 0 && (
        <p className="flex items-start gap-2 text-sm font-bold">
          <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
          {uncovered.length === 1
            ? 'One risk has'
            : `${uncovered.length} risks have`}{' '}
          no milestone this quarter. Check that this matches the approved plan’s
          timing before confirming material coverage.
        </p>
      )}
      {(large || coverage.split.length > 0) && (
        <p className="flex items-start gap-2 text-sm font-bold">
          <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
          <span>
            {coverage.split.length > 0
              ? `${coverage.split
                  .map(
                    ({ activity, count }) =>
                      `${activity?.code ?? 'An activity'} has ${count} milestones`,
                  )
                  .join('; ')}. `
              : 'This proposal is large. '}
            Check for duplicate, trivial or artificially split milestones: they
            would inflate the result and shrink the committee obligations’
            share.
          </span>
        </p>
      )}
      <fieldset className="grid gap-2">
        <legend className="text-sm font-bold">Confirm each check</legend>
        {checkKeys.map((key) => (
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
              className="mt-1"
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
      <div className="grid gap-2">
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
        <p role="alert" className="text-sm text-error-dark">
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
          <p className="mt-1 text-xs text-base-dark">
            Confirm all four checks and give a rationale of at least 20
            characters.
          </p>
        )}
      </div>
      <div className="grid gap-3 border-t pt-4">
        <fieldset className="grid gap-2">
          <legend className="text-sm font-bold">
            Or return it to the institution: which checks are not met?
          </legend>
          {checkKeys.map((key) => (
            <div key={key} className="flex items-start gap-2">
              <Checkbox
                id={`${baseline.id}-failed-${key}`}
                checked={failed.includes(key)}
                onCheckedChange={(checked) =>
                  setFailed((current) =>
                    checked === true
                      ? [...current, key]
                      : current.filter((item) => item !== key),
                  )
                }
                className="mt-1"
              />
              <Label
                htmlFor={`${baseline.id}-failed-${key}`}
                className="leading-snug font-normal"
              >
                {failedCheckLabels[key]}
              </Label>
            </div>
          ))}
        </fieldset>
        <div className="grid gap-2">
          <Label htmlFor={`${baseline.id}-return`}>
            Feedback for the institution
          </Label>
          <Textarea
            id={`${baseline.id}-return`}
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
          />
        </div>
        {giveBack.isError && (
          <p role="alert" className="text-sm text-error-dark">
            {giveBack.error.message}
          </p>
        )}
        <div>
          <Button
            variant="outline"
            disabled={
              returnReason.trim().length < 10 ||
              failed.length === 0 ||
              giveBack.isPending
            }
            onClick={() => giveBack.mutate(undefined)}
          >
            Return for revision
          </Button>
          {(returnReason.trim().length < 10 || failed.length === 0) && (
            <p className="mt-1 text-xs text-base-dark">
              Choose at least one check and give feedback of at least 10
              characters.
            </p>
          )}
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
    <div className="grid gap-2 rounded-md border bg-white p-4 text-sm">
      <p>
        This baseline was seeded for the simulated year. Confirm that its
        milestones correspond to the fictional approved plan before finalizing
        any {baseline.periodLabel} result. The confirmation time is recorded as
        now; nothing is backdated.
      </p>
      {confirm.isError && (
        <p role="alert" className="text-error-dark">
          {confirm.error.message}
        </p>
      )}
      <div>
        <Button
          variant="outline"
          className="h-auto max-w-full shrink py-2 text-left whitespace-normal"
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
  const latest = latestBaselines(plan);
  const missing = plan.proposals.filter(
    (proposal) =>
      !latest.some((baseline) => baseline.periodId === proposal.periodId),
  );
  return (
    <div className="grid gap-4">
      {missing.length > 0 && (
        <ul className="grid gap-2 rounded-lg border bg-white p-4 text-sm">
          {missing.map((proposal) => (
            <li key={proposal.periodId}>
              <span className="font-bold">{proposal.periodLabel}:</span>{' '}
              {proposal.locked
                ? 'no baseline was proposed before reporting opened; the result stays pending.'
                : `not proposed yet. The institution should propose it by ${formatDateTime(proposal.dueAt)}.`}
            </li>
          ))}
        </ul>
      )}
      {latest.map((baseline) => (
        <article
          key={baseline.id}
          aria-labelledby={`obl-${baseline.periodId}`}
          className="grid grid-cols-1 gap-3 rounded-lg border bg-white p-5"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`obl-${baseline.periodId}`} className="font-bold">
              {baseline.periodLabel}{' '}
              <span className="font-normal text-base-dark">
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
            <ApprovalPanel plan={plan} baseline={baseline} />
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
      <p className="text-sm text-base-dark">
        No amendments have been requested.
      </p>
    );
  return (
    <ul className="grid gap-3">
      {plan.amendments.map((amendment) => (
        <li
          key={amendment.id}
          className="grid gap-2 rounded-lg border bg-white p-4 text-sm"
        >
          <p className="font-bold">
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
          <p className="text-base-dark">
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
        <li role="alert" className="text-sm text-error-dark">
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
      indicator.checks.map(() => ({
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
    onSuccess: async (next) => {
      queryClient.setQueryData(foundationKeys.all(institutionId), next);
      await queryClient.invalidateQueries({ queryKey: planKeys.work });
    },
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
      {indicator.checks.map((label, index) => {
        const check = checks[index]!;
        const id = `${indicator.kind}-${index}`;
        return (
          <fieldset
            key={label}
            className="grid gap-2 rounded-md border bg-white p-3"
          >
            <legend className="px-1 text-sm font-bold">
              {index + 1}. {label}
              <span className="ml-2 font-normal text-base-dark">
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
                  className="max-w-mobile-lg"
                />
                {errors[`checks.${index}.passage`] && (
                  <p className="text-sm text-error-dark">
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
                  <p className="text-sm text-error-dark">
                    {errors[`checks.${index}.reason`]}
                  </p>
                )}
              </div>
            )}
          </fieldset>
        );
      })}
      {mutation.isError && (
        <p role="alert" className="text-sm text-error-dark">
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
              className="grid gap-4 rounded-lg border bg-white p-5"
            >
              <h3 id={`of-${indicator.kind}`} className="text-lg font-bold">
                {indicator.label}{' '}
                <span className="text-sm font-normal text-base-dark">
                  · up to {indicator.maxPoints} points
                </span>
              </h3>
              <dl className="grid gap-4 tablet:grid-cols-2">
                <div className="rounded-md bg-base-lightest p-4">
                  <dt className="text-sm font-bold">
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
                <div className="rounded-md bg-primary-lighter p-4">
                  <dt className="text-sm font-bold">
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
  const tab = route.useSearch().tab ?? 'baselines';
  const navigate = route.useNavigate();
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
      <OfficerAssignment institutionId={institutionId} />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({
            search: { tab: value as typeof tab },
            replace: true,
          })
        }
        className="grid grid-cols-1 gap-4"
      >
        <TabsList className="h-auto w-fit max-w-full flex-wrap justify-start">
          <TabsTrigger value="quarters">Quarters</TabsTrigger>
          <TabsTrigger value="baselines">Baselines</TabsTrigger>
          <TabsTrigger value="amendments">
            Amendments{pendingAmendments ? ` (${pendingAmendments})` : ''}
          </TabsTrigger>
          <TabsTrigger value="foundations">Foundations</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
        </TabsList>
        <TabsContent value="quarters">
          <QuarterDispositions institutionId={institutionId} />
        </TabsContent>
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
        <TabsContent value="plan">
          <QueryView query={plan} label="plan">
            {(data) => (
              <div className="grid min-w-0 grid-cols-1 gap-6">
                <PlanApprovalRecord plan={data} />
                <section aria-labelledby="officer-risks" className="grid gap-3">
                  <h2 id="officer-risks" className="text-lg font-bold">
                    Risk register
                  </h2>
                  <RiskTable risks={data.risks} />
                </section>
                <section
                  aria-labelledby="officer-activities"
                  className="grid gap-3"
                >
                  <h2 id="officer-activities" className="text-lg font-bold">
                    Mitigation activities
                  </h2>
                  <ActivityTable plan={data} />
                </section>
              </div>
            )}
          </QueryView>
        </TabsContent>
      </Tabs>
    </div>
  );
}
