import type { AnnualEvaluation } from '@cpi/contracts';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { annualQuery } from '@/features/annual/queries';
import { AnnualResultView } from '@/features/annual/result-view';
import { formatDateTime } from '@/lib/dates';

/** The summary stays one short line; the reasons are listed when the row is expanded. */
function notReady(total: AnnualEvaluation['total']) {
  if (total.status !== 'pending') return 'not ready';
  const count = total.reasons.length;
  return `not ready · ${count} ${count === 1 ? 'item' : 'items'} outstanding`;
}

export function SupervisorAnnualPage() {
  const annual = useQuery(annualQuery);
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Oversight"
        title="Annual release readiness"
        description="Read only. The administrator publishes ready institutions in a batch after the evaluation cutoff; unreleased institutions are listed with reasons, not as a complete ranking."
      />
      <QueryView query={annual} label="annual evaluation">
        {(data) => (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Evaluation cutoff {formatDateTime(data.evaluationCutoff)} (
              {data.cutoffPassed ? 'passed' : 'not yet passed'}) · as of{' '}
              {formatDateTime(data.asOf)}
            </p>
            {data.institutions.map((evaluation) => (
              <details
                key={evaluation.institutionId}
                className="rounded-lg border bg-card p-4"
              >
                <summary className="cursor-pointer text-sm">
                  <span className="font-semibold">
                    {evaluation.institutionId}
                  </span>{' '}
                  {evaluation.institutionName} ·{' '}
                  {evaluation.publication
                    ? `published v${evaluation.publication.version}${evaluation.publication.stale ? ' (out of date)' : ''}`
                    : evaluation.releasable
                      ? 'ready for release'
                      : notReady(evaluation.total)}
                </summary>
                <div className="mt-4">
                  <AnnualResultView
                    evaluation={evaluation}
                    profileName={data.profileName}
                    simulation={data.simulation}
                  />
                </div>
              </details>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}
