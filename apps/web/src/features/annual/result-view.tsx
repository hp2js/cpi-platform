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
import { formatDateTime, formatDays } from '@/lib/dates';

type Evaluation = Pick<
  AnnualEvaluation,
  | 'institutionId'
  | 'institutionName'
  | 'officerName'
  | 'quarters'
  | 'foundations'
  | 'weights'
  | 'total'
>;

const dispositionLabel: Record<QuarterDisposition['status'], string> = {
  finalized: 'Finalized',
  closed_without_submission: 'Closed without submission (0)',
  awaiting_review: 'Awaiting officer review',
  awaiting_institution: 'Awaiting institution response',
  not_submitted: 'Not submitted',
};

/** Quarter implementation points: the profile's implementation weight ÷ 4, from the exact fraction. */
function quarterPoints(quarter: QuarterDisposition, quarterMax: number) {
  if (!quarter.implementation) return 'Pending';
  return (
    (quarterMax * quarter.implementation.numerator) /
    quarter.implementation.denominator
  ).toFixed(2);
}

const formatQuarterMax = (implementation: number) =>
  Number.isInteger(implementation / 4)
    ? String(implementation / 4)
    : (implementation / 4).toFixed(2);

/** A foundation with no points under the profile is a prerequisite: met or not met. */
function foundationResult(score: Evaluation['foundations'][number]['score']) {
  if (score.maxPoints === 0)
    return score.status === 'calculated'
      ? score.fraction.numerator === score.fraction.denominator
        ? 'Prerequisite met (no points)'
        : `Prerequisite not met: ${score.fraction.numerator} of ${score.fraction.denominator} checks (no points)`
      : 'Prerequisite: pending review';
  return score.status === 'calculated'
    ? `${score.points} / ${score.maxPoints}`
    : `Pending (max ${score.maxPoints})`;
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
              {evaluation.total.implementationPoints} (
              {evaluation.weights.implementation} × average of four quarters,{' '}
              {evaluation.total.implementationAverage.numerator}/
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
                  {foundationResult(foundation.score)}
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
            Each quarter contributes up to{' '}
            {formatQuarterMax(evaluation.weights.implementation)} implementation
            points. A missing quarter is never averaged away.
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
                  {quarterPoints(
                    quarter,
                    evaluation.weights.implementation / 4,
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {quarter.late ? (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <AlarmClock className="size-4" aria-hidden="true" />
                      Late by{' '}
                      {formatDays(quarter.daysLate ?? 0, quarter.daysLateUnit)}
                    </span>
                  ) : quarter.firstSubmittedAt ? (
                    'On time'
                  ) : (
                    '—'
                  )}
                  {quarter.firstSubmittedAt && (
                    <span className="block text-xs text-muted-foreground">
                      First submitted {formatDateTime(quarter.firstSubmittedAt)}
                      {quarter.firstCompleteEvidenceAt
                        ? quarter.firstCompleteEvidenceAt !==
                          quarter.firstSubmittedAt
                          ? `; evidence complete ${formatDateTime(quarter.firstCompleteEvidenceAt)}`
                          : '; evidence complete'
                        : '; evidence never complete'}
                    </span>
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
