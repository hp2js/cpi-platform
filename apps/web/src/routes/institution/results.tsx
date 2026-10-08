import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
import { downloadExport, resultsQuery } from '@/features/annual/queries';
import { PublishedResults } from '@/features/annual/published-results';
import { cycleQuery, institutionQuery } from '@/features/directory/queries';
import { useSession } from '@/features/session/use-session';

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
            <PublishedResults
              results={data.results}
              cycleLabel={cycle.data?.label ?? ''}
            />
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
