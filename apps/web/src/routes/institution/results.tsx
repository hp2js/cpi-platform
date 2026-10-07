import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
import { downloadExport, resultsQuery } from '@/features/annual/queries';
import { cycleQuery, institutionQuery } from '@/features/directory/queries';
import {
  ReportCover,
  ReportSignoff,
} from '@/features/report-identity/report-identity';
import { useSession } from '@/features/session/use-session';
import { AnnualResultView } from '@/features/annual/result-view';
import { formatDateTime } from '@/lib/dates';

export function ResultsPage() {
  const results = useQuery(resultsQuery);
  const institutionId = useSession().user.institutionId ?? '';
  // Whose result this is: the page names the institution, which a printout needs.
  const institution = useQuery(institutionQuery(institutionId));
  const cycle = useQuery(cycleQuery);
  const exportCsv = useMutation({
    mutationFn: () =>
      downloadExport('/api/results/export.csv', 'cpi-annual-result.csv'),
  });
  const current = results.data?.results.find(
    (result) => result.status === 'current',
  );
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={
          institution.data
            ? `${institutionId} · ${institution.data.name}`
            : institutionId
        }
        title="Annual results"
        description="Your own published result and its explanation. Other institutions’ results and evidence are never shown here."
        screenOnlyDescription
        actions={
          current && (
            <>
              <Button variant="plain" onClick={() => window.print()}>
                <Printer aria-hidden="true" />
                Print
              </Button>
              <Button
                variant="plain"
                onClick={() => exportCsv.mutate()}
                disabled={exportCsv.isPending}
              >
                <Download aria-hidden="true" />
                Export CSV
              </Button>
            </>
          )
        }
      />
      <QueryView query={results} label="results">
        {(data) =>
          !data.released ? (
            <section
              aria-labelledby="unreleased-heading"
              className="rounded-lg border bg-white p-5"
            >
              <h2 id="unreleased-heading" className="font-bold">
                Not yet published
              </h2>
              <p className="mt-1 text-sm text-base-dark">{data.message}</p>
            </section>
          ) : (
            <div className="grid gap-8">
              {data.results.map((result) => (
                <section
                  key={result.id}
                  aria-labelledby={`result-${result.id}`}
                  className="grid gap-4"
                >
                  <div>
                    <h2
                      id={`result-${result.id}`}
                      className="text-lg font-bold"
                    >
                      Version {result.version}{' '}
                      {result.status === 'current'
                        ? '(current)'
                        : '(superseded)'}
                    </h2>
                    <p className="text-sm text-base-dark">
                      Published {formatDateTime(result.publishedAt)} by{' '}
                      {result.publishedBy} · batch {result.batchId}
                      {result.correctionReason &&
                        ` · correction: ${result.correctionReason}`}
                    </p>
                  </div>
                  {result.status === 'current' ? (
                    <>
                      {/* Branded as published: the identity kept with this version (HP2-65). */}
                      <ReportCover
                        identity={result.identity}
                        cycleLabel={cycle.data?.label ?? ''}
                        subject={`${result.institutionId} · ${result.institutionName}`}
                      />
                      <AnnualResultView
                        evaluation={result.evaluation}
                        profileName={result.profileName}
                        simulation={result.simulation}
                      />
                      <ReportSignoff identity={result.identity} />
                    </>
                  ) : (
                    <p className="bg-base-lightest p-4 text-sm">
                      Superseded result:{' '}
                      {result.evaluation.total.status === 'calculated'
                        ? `${result.evaluation.total.points} / 100`
                        : 'not calculated'}
                      . It remains on record; the current version above replaces
                      it.
                    </p>
                  )}
                </section>
              ))}
            </div>
          )
        }
      </QueryView>
      {exportCsv.isError && (
        <p role="alert" className="text-sm text-error-dark">
          {exportCsv.error.message}
        </p>
      )}
    </div>
  );
}
