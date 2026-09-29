import type { Amendment, BaselineProposal, Plan } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DeadlineCountdown } from '@/components/deadline-countdown';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { invalidateEvents } from '@/features/events/queries';
import {
  BaselineNotes,
  BaselineStatus,
  MilestoneTable,
  RiskTable,
} from '@/features/planning/baseline-view';
import { latestBaselines, proposalsDue } from '@/features/planning/labels';
import {
  ActivityDialog,
  ActivityTable,
  ImportPlanDialog,
  MilestoneDialog,
  PlanApprovalRecord,
  ProposeDialog,
  RemovePlanItem,
  RiskDialog,
} from '@/features/planning/plan-editor';
import {
  invalidatePlan,
  planQuery,
  requestAmendment,
} from '@/features/planning/queries';
import { useSession } from '@/features/session/use-session';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { SelectField } from '@/components/select-field';

/** Amendments apply only to periods that have not opened; the original baseline is kept (FR04, AT17). */
function AmendmentForm({ plan }: { plan: Plan }) {
  const queryClient = useQueryClient();
  const unlocked = latestBaselines(plan).filter((baseline) => !baseline.locked);
  // Only approved baselines are amended; until then the plan is edited and proposed again.
  const open = unlocked.filter((baseline) => baseline.status === 'approved');
  const [periodId, setPeriodId] = useState(open[0]?.periodId ?? '');
  const baseline = open.find((candidate) => candidate.periodId === periodId);
  const candidates =
    baseline?.milestones.filter((milestone) => !milestone.mandatory) ?? [];
  const [milestoneId, setMilestoneId] = useState('');
  const [change, setChange] = useState<'remove' | 'reschedule'>('reschedule');
  const later = unlocked.filter(
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
        No approved baseline is open for amendment. Until a quarter’s baseline
        is approved, change its planned milestones above and propose it again.
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

function PlannedMilestoneTable({
  plan,
  proposal,
  editable,
}: {
  plan: Plan;
  proposal: BaselineProposal;
  editable: boolean;
}) {
  const milestones = plan.plannedMilestones.filter(
    (milestone) => milestone.periodId === proposal.periodId,
  );
  const activityOf = new Map(
    plan.activities.map((activity) => [activity.id, activity]),
  );
  if (!milestones.length)
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        No milestones planned for {proposal.periodLabel} yet.
        {editable &&
          ` Add the milestones your activities will reach in ${proposal.periodLabel}.`}
      </p>
    );
  return (
    <div className="rounded-md border">
      <Table className="min-w-[40rem]">
        <TableCaption className="sr-only">
          Milestones planned for {proposal.periodLabel}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Milestone</TableHead>
            <TableHead scope="col">Activity</TableHead>
            <TableHead scope="col">Completion condition</TableHead>
            {editable && (
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {milestones.map((milestone) => {
            const activity = activityOf.get(milestone.activityId);
            return (
              <TableRow key={milestone.id}>
                <TableHead
                  scope="row"
                  className="h-auto py-2 font-normal whitespace-normal"
                >
                  <span className="font-medium">{milestone.code}</span>{' '}
                  {milestone.title}
                </TableHead>
                <TableCell className="text-sm whitespace-normal">
                  {activity ? `${activity.code} ${activity.title}` : '—'}
                </TableCell>
                <TableCell className="text-sm whitespace-normal">
                  {milestone.completionCondition}
                  <span className="block text-xs text-muted-foreground">
                    Evidence: {milestone.evidenceExpectation}
                  </span>
                </TableCell>
                {editable && (
                  <TableCell className="text-right whitespace-nowrap">
                    <MilestoneDialog
                      plan={plan}
                      milestone={milestone}
                      proposal={proposal}
                    />
                    <RemovePlanItem
                      plan={plan}
                      collection="plan-milestones"
                      id={milestone.id}
                      code={milestone.code}
                    />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const proposalStatus = {
  not_proposed: 'Not proposed yet',
  proposed: 'Awaiting officer approval',
  returned: 'Returned for revision',
  approved: 'Approved',
} as const;

/** One quarter: its planned milestones while open, and the baseline versions sent so far. */
function QuarterBaseline({
  plan,
  proposal,
}: {
  plan: Plan;
  proposal: BaselineProposal;
}) {
  const versions = plan.baselines.filter(
    (baseline) => baseline.periodId === proposal.periodId,
  );
  const baseline = versions.at(-1);
  const open = !proposal.locked && proposal.status !== 'approved';
  const editable = plan.editable && open;
  const due =
    open &&
    (proposal.status === 'not_proposed' || proposal.status === 'returned');
  const canPropose =
    editable &&
    (proposal.status !== 'proposed' || proposal.changedSinceProposal);
  return (
    <article
      aria-labelledby={`bl-${proposal.periodId}`}
      className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border bg-card p-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 id={`bl-${proposal.periodId}`} className="font-semibold">
            {proposal.periodLabel} baseline
            {baseline && (
              <span className="font-normal text-muted-foreground">
                {' '}
                · version {baseline.version} · {baseline.milestones.length}{' '}
                milestones
              </span>
            )}
          </h3>
          {open && (
            <p className="text-sm text-muted-foreground">
              Propose by {formatDateTime(proposal.dueAt)}; the quarter starts{' '}
              {formatDateTime(proposal.startsAt).replace(/, 00:00 EAT$/, '')}.
            </p>
          )}
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {due && <DeadlineCountdown deadline={proposal.dueAt} />}
          {baseline ? (
            <BaselineStatus baseline={baseline} />
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
              {proposal.locked
                ? 'No baseline: pending approval'
                : proposalStatus[proposal.status]}
            </span>
          )}
        </span>
      </header>
      {baseline && <BaselineNotes baseline={baseline} />}
      {open ? (
        <>
          {proposal.status === 'proposed' && proposal.changedSinceProposal && (
            <p className="rounded-md bg-accent p-3 text-sm">
              You changed the {proposal.periodLabel} milestones after version{' '}
              {baseline?.version} was proposed. Propose again so your officer
              approves what you plan.
            </p>
          )}
          <PlannedMilestoneTable
            plan={plan}
            proposal={proposal}
            editable={editable}
          />
          <p className="text-xs text-muted-foreground">
            The quarter’s CPC and IAO meetings are added to every proposal.
          </p>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <MilestoneDialog plan={plan} proposal={proposal} />
              {canPropose && <ProposeDialog plan={plan} proposal={proposal} />}
            </div>
          )}
          {baseline && (
            <details className="text-sm">
              <summary className="cursor-pointer">
                Version {baseline.version} as sent to your officer
              </summary>
              <div className="mt-2">
                <MilestoneTable baseline={baseline} />
              </div>
            </details>
          )}
        </>
      ) : baseline ? (
        <MilestoneTable baseline={baseline} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Reporting has opened without an approved baseline, so the quarter’s
          implementation result stays pending.
        </p>
      )}
      {versions.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Earlier versions kept:{' '}
          {versions
            .slice(0, -1)
            .map(
              (version) =>
                `v${version.version} (${version.milestones.length} milestones, ${version.status})`,
            )
            .join(', ')}
          .
        </p>
      )}
    </article>
  );
}

/** What the institution should do next with its plan, if anything. */
function NextStep({ plan }: { plan: Plan }) {
  if (!plan.editable) return null;
  const next = proposalsDue(plan)[0];
  const message = !plan.approval
    ? 'Start by recording who approved your plan, then add its risks, activities and milestones.'
    : next
      ? next.status === 'returned'
        ? `Your officer returned the ${next.periodLabel} baseline. Correct its milestones and propose it again by ${formatDateTime(next.dueAt)}.`
        : next.plannedMilestones
          ? `Propose your ${next.periodLabel} baseline by ${formatDateTime(next.dueAt)}.`
          : `Plan your ${next.periodLabel} milestones and propose the baseline by ${formatDateTime(next.dueAt)}.`
      : null;
  if (!message) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-accent p-4 text-sm"
    >
      <p className="font-medium">{message}</p>
      {plan.approval && next && <DeadlineCountdown deadline={next.dueAt} />}
    </div>
  );
}

/**
 * The institution's plan (FR04): the approval record, risks, activities and each quarter's
 * milestones, which it proposes to its officer as the quarter's baseline, and amendments.
 */
export function InstitutionPlan() {
  const session = useSession();
  const institutionId = session.user.institutionId ?? '';
  const plan = useQuery(planQuery(institutionId));
  return (
    <QueryView query={plan} label="plan">
      {(data) => (
        <div className="grid min-w-0 grid-cols-1 gap-8">
          <NextStep plan={data} />
          <PlanApprovalRecord plan={data} />
          <section
            aria-labelledby="risks-heading"
            className="grid min-w-0 grid-cols-1 gap-3"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="risks-heading" className="text-lg font-semibold">
                  Risk register
                </h2>
                <p className="text-sm text-muted-foreground">
                  The corruption risks from your risk assessment.
                </p>
              </div>
              {data.editable && (
                <div className="flex flex-wrap gap-2">
                  <ImportPlanDialog plan={data} />
                  <RiskDialog plan={data} />
                </div>
              )}
            </div>
            <RiskTable
              risks={data.risks}
              actions={
                data.editable
                  ? (risk) => (
                      <>
                        <RiskDialog plan={data} risk={risk} />
                        <RemovePlanItem
                          plan={data}
                          collection="risks"
                          id={risk.id}
                          code={risk.code}
                        />
                      </>
                    )
                  : undefined
              }
            />
          </section>
          <section
            aria-labelledby="activities-heading"
            className="grid min-w-0 grid-cols-1 gap-3"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="activities-heading" className="text-lg font-semibold">
                  Mitigation activities
                </h2>
                <p className="text-sm text-muted-foreground">
                  What you will do about each risk, and how progress is
                  measured.
                </p>
              </div>
              {data.editable && <ActivityDialog plan={data} />}
            </div>
            <ActivityTable
              plan={data}
              actions={
                data.editable
                  ? (activity) => (
                      <>
                        <ActivityDialog plan={data} activity={activity} />
                        <RemovePlanItem
                          plan={data}
                          collection="activities"
                          id={activity.id}
                          code={activity.code}
                        />
                      </>
                    )
                  : undefined
              }
            />
          </section>
          <section
            aria-labelledby="baselines-heading"
            className="grid min-w-0 grid-cols-1 gap-4"
          >
            <div>
              <h2 id="baselines-heading" className="text-lg font-semibold">
                Quarterly baselines
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Plan each quarter’s milestones and propose them before the
                quarter starts. Your implementation result is measured against
                the approved baseline. Once approved, changes need an amendment,
                and none are possible after reporting opens.
              </p>
            </div>
            {data.proposals.map((proposal) => (
              <QuarterBaseline
                key={proposal.periodId}
                plan={data}
                proposal={proposal}
              />
            ))}
          </section>
          <section
            aria-labelledby="amend-heading"
            className="grid min-w-0 grid-cols-1 gap-3"
          >
            <h2 id="amend-heading" className="text-lg font-semibold">
              Amendments
            </h2>
            <p className="text-sm text-muted-foreground">
              For an approved baseline whose quarter has not ended.
            </p>
            <AmendmentList amendments={data.amendments} />
            {data.editable && <AmendmentForm plan={data} />}
          </section>
        </div>
      )}
    </QueryView>
  );
}
