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
import { failedCheckLabels } from '@/features/planning/labels';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

const status = {
  approved: {
    label: 'Approved',
    icon: CircleCheck,
    className: 'bg-success text-success-foreground',
  },
  proposed: {
    label: 'Awaiting officer approval',
    icon: Clock,
    className: 'bg-secondary text-secondary-foreground',
  },
  returned: {
    label: 'Returned for revision',
    icon: Undo2,
    className: 'bg-muted text-foreground',
  },
} as const;

export function BaselineStatus({ baseline }: { baseline: Baseline }) {
  const { label, icon: Icon, className } = status[baseline.status];
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          className,
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </span>
      {baseline.historicalSeed && (
        <span className="rounded-md border px-2 py-0.5 text-xs font-semibold tracking-wide">
          SEEDED HISTORICAL BASELINE ·{' '}
          {baseline.historicalSeed.confirmedAt
            ? 'confirmed'
            : 'awaiting officer confirmation'}
        </span>
      )}
      {baseline.locked && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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
                <span className="font-medium">{milestone.code}</span>{' '}
                {milestone.title}
                {milestone.mandatory && (
                  <span className="block text-xs text-muted-foreground">
                    Committee obligation
                  </span>
                )}
              </TableHead>
              <TableCell className="text-sm whitespace-normal">
                {milestone.activity}
                <span className="block text-xs text-muted-foreground">
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

export function BaselineNotes({ baseline }: { baseline: Baseline }) {
  return (
    <div className="grid gap-1 text-sm">
      {baseline.approval && (
        <p>
          <span className="text-muted-foreground">
            Approved by {baseline.approval.by},{' '}
            {formatDateTime(baseline.approval.at)}:{' '}
          </span>
          {baseline.approval.rationale}
        </p>
      )}
      {baseline.returned && (
        <div>
          <p>
            <span className="text-muted-foreground">
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
        <p className="text-muted-foreground">
          {baseline.historicalSeed.reason} Loaded{' '}
          {formatDateTime(baseline.historicalSeed.loadedAt)}
          {baseline.historicalSeed.confirmedAt
            ? `; confirmed by ${baseline.historicalSeed.confirmedBy}, ${formatDateTime(baseline.historicalSeed.confirmedAt)}.`
            : '.'}
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
  if (!risks.length)
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No risks recorded yet.
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table className="min-w-[40rem]">
        <TableCaption className="text-left">
          Severity is probability × impact on the cycle's 1–5 scale. No rating
          bands are applied.
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
                <span className="font-medium">{risk.code}</span>{' '}
                {risk.description}
              </TableHead>
              <TableCell className="text-sm whitespace-normal">
                {risk.cause}
              </TableCell>
              <TableCell className="tabular-nums">{risk.probability}</TableCell>
              <TableCell className="tabular-nums">{risk.impact}</TableCell>
              <TableCell className="font-medium tabular-nums">
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
