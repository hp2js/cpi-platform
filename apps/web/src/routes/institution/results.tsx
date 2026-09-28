import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
import { downloadExport, resultsQuery } from '@/features/annual/queries';
import { AnnualResultView } from '@/features/annual/result-view';
import { formatDateTime } from '@/lib/dates';

export function ResultsPage() {
  const results = useQuery(resultsQuery);
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
        title="Annual results"
        description="Your own published result and its explanation. Other institutions’ results and evidence are never shown here."
        actions={
          current && (
            <>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer aria-hidden="true" />
                Print
              </Button>
              <Button
                variant="outline"
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
              className="rounded-lg border bg-card p-5"
            >
              <h2 id="unreleased-heading" className="font-semibold">
                Not yet published
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.message}
              </p>
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
                      className="text-lg font-semibold"
                    >
                      Version {result.version}{' '}
                      {result.status === 'current'
                        ? '(current)'
                        : '(superseded)'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Published {formatDateTime(result.publishedAt)} by{' '}
                      {result.publishedBy} · batch {result.batchId}
                      {result.correctionReason &&
                        ` · correction: ${result.correctionReason}`}
                    </p>
                  </div>
                  {result.status === 'current' ? (
                    <AnnualResultView
                      evaluation={result.evaluation}
                      profileName={result.profileName}
                      simulation={result.simulation}
                    />
                  ) : (
                    <p className="rounded-md border border-dashed p-4 text-sm">
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
        <p role="alert" className="text-sm text-destructive">
          {exportCsv.error.message}
        </p>
      )}
    </div>
  );
}
