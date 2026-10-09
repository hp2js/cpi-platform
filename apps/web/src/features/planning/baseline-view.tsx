import type { Baseline, Risk } from '@cpi/contracts';
import { CircleCheck, Clock, Lock, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { cycleQuery } from '@/features/directory/queries';
import { failedCheckLabels, scalePoint } from '@/features/planning/labels';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

const status = {
  approved: {
    label: 'Approved',
    icon: CircleCheck,
    className: 'bg-success-lighter text-success-darker',
  },
  proposed: {
    label: 'Awaiting officer approval',
    icon: Clock,
    className: 'bg-warning-lighter text-ink',
  },
  returned: {
    label: 'Returned for revision',
    icon: Undo2,
    className: 'bg-base-lightest text-ink',
  },
} as const;

/**
 * One status per baseline (HP2-53). A seeded historical baseline (PRD §10.4) is usable only
 * once the officer confirms it, so it never shows "Approved" beside a pending confirmation.
 */
function statusOf(baseline: Baseline) {
  if (!baseline.historicalSeed) return status[baseline.status];
  return baseline.historicalSeed.confirmedAt
    ? { ...status.approved, label: 'Seeded historical baseline · confirmed' }
    : {
        ...status.proposed,
        label: 'Seeded historical baseline · officer to confirm',
      };
}

export function BaselineStatus({ baseline }: { baseline: Baseline }) {
  const { label, icon: Icon, className } = statusOf(baseline);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-sm px-2 py-1 text-xs font-bold',
          className,
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </span>
      {baseline.locked && (
        <span className="inline-flex items-center gap-1 text-xs text-base-dark">
          <Lock className="size-3.5" aria-hidden="true" />
          Locked: reporting has opened
        </span>
      )}
    </span>
  );
}

export function MilestoneTable({ baseline }: { baseline: Baseline }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="min-w-[40rem]">
        <TableCaption className="sr-only">
          {baseline.periodLabel} baseline version {baseline.version}:{' '}
          {baseline.milestones.length} milestones
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Milestone</TableHead>
            <TableHead scope="col">Activity and risk</TableHead>
            <TableHead scope="col">Completion condition</TableHead>
            <TableHead scope="col">Weight</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {baseline.milestones.map((milestone) => (
            <TableRow key={milestone.id}>
              <TableHead
                scope="row"
                className="h-auto py-2 font-normal whitespace-normal"
              >
                <span className="font-bold">{milestone.code}</span>{' '}
                {milestone.title}
                {milestone.mandatory && (
                  <span className="block text-xs text-base-dark">
                    Committee obligation
                  </span>
                )}
              </TableHead>
              <TableCell className="text-sm whitespace-normal">
                {milestone.activity}
                <span className="block text-xs text-base-dark">
                  {milestone.risk}
                </span>
              </TableCell>
              <TableCell className="text-sm whitespace-normal">
                {milestone.completionCondition}
              </TableCell>
              <TableCell className="tabular-nums">{milestone.weight}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Who reads the notes: the institution is told nothing is needed from it; staff are told the
 * officer confirms a seeded baseline before its quarter's reviews can be finalized.
 */
export function BaselineNotes({
  baseline,
  audience = 'staff',
}: {
  baseline: Baseline;
  audience?: 'institution' | 'staff';
}) {
  return (
    <div className="grid gap-1 text-sm">
      {baseline.approval && (
        <p>
          <span className="text-base-dark">
            Approved by {baseline.approval.by},{' '}
            {formatDateTime(baseline.approval.at)}:{' '}
          </span>
          {baseline.approval.rationale}
        </p>
      )}
      {baseline.returned && (
        <div>
          <p>
            <span className="text-base-dark">
              Returned by {baseline.returned.by},{' '}
              {formatDateTime(baseline.returned.at)}:{' '}
            </span>
            {baseline.returned.reason}
          </p>
          {baseline.returned.failedChecks.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {baseline.returned.failedChecks.map((check) => (
                <li key={check}>{failedCheckLabels[check]}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {baseline.historicalSeed && (
        <p className="text-base-dark">
          This is a seeded historical baseline: the simulation loaded{' '}
          {baseline.periodLabel}&rsquo;s milestones from the approved plan
          because the quarter had opened before the platform was in use (
          {formatDateTime(baseline.historicalSeed.loadedAt)}).{' '}
          {baseline.historicalSeed.confirmedAt
            ? `${baseline.historicalSeed.confirmedBy} confirmed it matches the approved plan, ${formatDateTime(baseline.historicalSeed.confirmedAt)}.`
            : audience === 'institution'
              ? 'Nothing is needed from you: your officer confirms it matches your approved plan.'
              : `The officer confirms it matches the approved plan; until then, ${baseline.periodLabel} reviews cannot be finalized.`}
        </p>
      )}
    </div>
  );
}

/** Severity is the product on the cycle's 1–5 scale; no colour bands are inferred (O16). */
export function RiskTable({
  risks,
  actions,
}: {
  risks: Risk[];
  actions?: (risk: Risk) => ReactNode;
}) {
  const scale = useQuery(cycleQuery).data?.riskScale;
  if (!risks.length)
    return (
      <p className="rounded-lg border bg-white p-4 text-sm text-base-dark">
        No risks recorded yet.
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <Table className="min-w-[40rem]">
        <TableCaption className="text-left">
          Severity is probability × impact on the cycle’s 1–5 scale. No rating
          bands are applied.
          {scale && <span className="block">Scale labels: {scale.source}</span>}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Risk</TableHead>
            <TableHead scope="col">Cause</TableHead>
            <TableHead scope="col">Probability</TableHead>
            <TableHead scope="col">Impact</TableHead>
            <TableHead scope="col">Severity</TableHead>
            {actions && (
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {risks.map((risk) => (
            <TableRow key={risk.id}>
              <TableHead
                scope="row"
                className="h-auto py-2 font-normal whitespace-normal"
              >
                <span className="font-bold">{risk.code}</span>{' '}
                {risk.description}
              </TableHead>
              <TableCell className="text-sm whitespace-normal">
                {risk.cause}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {scalePoint(scale, 'probability', risk.probability)}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {scalePoint(scale, 'impact', risk.impact)}
              </TableCell>
              <TableCell className="font-bold tabular-nums">
                {risk.severity}
              </TableCell>
              {actions && (
                <TableCell className="text-right whitespace-nowrap">
                  {actions(risk)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
