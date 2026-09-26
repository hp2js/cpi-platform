import type { AnnualEvaluation, QuarterDisposition } from '@cpi/contracts';
import { AlarmClock } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/dates';

type Evaluation = Pick<
  AnnualEvaluation,
  | 'institutionId'
  | 'institutionName'
  | 'officerName'
  | 'quarters'
  | 'foundations'
  | 'total'
>;

const dispositionLabel: Record<QuarterDisposition['status'], string> = {
  finalized: 'Finalized',
  closed_without_submission: 'Closed without submission (0)',
  awaiting_review: 'Awaiting officer review',
  awaiting_institution: 'Awaiting institution response',
  not_submitted: 'Not submitted',
};

/** Quarter implementation points: 60 ÷ 4 = 15 per quarter, from the exact fraction. */
function quarterPoints(quarter: QuarterDisposition) {
  if (!quarter.implementation) return 'Pending';
  return (
    (15 * quarter.implementation.numerator) /
    quarter.implementation.denominator
  ).toFixed(2);
}

/** Explains an annual result: foundations once, four equal quarters, reasons for rejected claims. */
export function AnnualResultView({
  evaluation,
  profileName,
  simulation,
}: {
  evaluation: Evaluation;
  profileName: string;
  simulation: boolean;
}) {
  return (
    <div className="grid gap-6">
      <section
        aria-labelledby={`total-${evaluation.institutionId}`}
        className="rounded-lg border bg-card p-5"
      >
        <h3 id={`total-${evaluation.institutionId}`} className="font-semibold">
          Annual result
        </h3>
        {evaluation.total.status === 'calculated' ? (
          <div className="mt-2 grid gap-1">
            <p className="text-3xl font-semibold tabular-nums">
              {evaluation.total.points}
              <span className="text-base font-normal text-muted-foreground">
                {' '}
                / 100
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              Foundations {evaluation.total.foundationPoints} + implementation{' '}
              {evaluation.total.implementationPoints} (60 × average of four
              quarters, {evaluation.total.implementationAverage.numerator}/
              {evaluation.total.implementationAverage.denominator})
            </p>
          </div>
        ) : (
          <div className="mt-2 text-sm">
            <p className="font-medium">Pending: not yet calculable</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {evaluation.total.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {profileName}
          {simulation && ' · simulation profile, not official EACC scoring'}.
          Late reporting is shown separately; no late penalty is applied in this
          demonstration. Scores measure performance against each institution’s
          own accepted plan, not equal prevention impact.
        </p>
      </section>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="min-w-[44rem]">
          <TableCaption className="text-left">
            Foundations are counted once, from the version effective at the
            evaluation cutoff.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Foundation</TableHead>
              <TableHead scope="col">Result</TableHead>
              <TableHead scope="col">Checks not met</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evaluation.foundations.map((foundation) => (
              <TableRow key={foundation.kind}>
                <TableHead scope="row">{foundation.label}</TableHead>
                <TableCell className="tabular-nums">
                  {foundation.score.status === 'calculated'
                    ? `${foundation.score.points} / ${foundation.score.maxPoints}`
                    : `Pending (max ${foundation.score.maxPoints})`}
                </TableCell>
                <TableCell className="text-sm whitespace-normal">
                  {foundation.failedChecks.length
                    ? foundation.failedChecks
                        .map((check) => `${check.check}: ${check.reason}`)
                        .join(' · ')
                    : 'None'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="min-w-[52rem]">
          <TableCaption className="text-left">
            Each quarter contributes up to 15 implementation points. A missing
            quarter is never averaged away.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Quarter</TableHead>
              <TableHead scope="col">Disposition</TableHead>
              <TableHead scope="col">Milestones accepted</TableHead>
              <TableHead scope="col">Points</TableHead>
              <TableHead scope="col">Timeliness</TableHead>
              <TableHead scope="col">Reviewer and feedback</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evaluation.quarters.map((quarter) => (
              <TableRow key={quarter.periodId}>
                <TableHead scope="row">{quarter.periodLabel}</TableHead>
                <TableCell className="text-sm">
                  {dispositionLabel[quarter.status]}
                </TableCell>
                <TableCell className="tabular-nums">
                  {quarter.implementation
                    ? `${quarter.implementation.numerator} of ${quarter.implementation.denominator}`
                    : '—'}
                </TableCell>
                <TableCell className="tabular-nums">
                  {quarterPoints(quarter)}
                </TableCell>
                <TableCell className="text-sm">
                  {quarter.late ? (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <AlarmClock className="size-4" aria-hidden="true" />
                      Late
                      {quarter.firstSubmittedAt
                        ? `: ${formatDateTime(quarter.firstSubmittedAt)}`
                        : ''}
                    </span>
                  ) : quarter.firstSubmittedAt ? (
                    'On time'
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-sm whitespace-normal">
                  {quarter.reviewedBy && (
                    <span className="block text-muted-foreground">
                      {quarter.reviewedBy}
                    </span>
                  )}
                  {quarter.note && (
                    <span className="block">{quarter.note}</span>
                  )}
                  {quarter.rejected.map((rejected) => (
                    <span key={rejected.code} className="block">
                      <span className="font-medium">{rejected.code}</span> not
                      accepted: {rejected.reason}
                    </span>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
