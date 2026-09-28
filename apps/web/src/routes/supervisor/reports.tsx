import type { ConsolidatedReport } from '@cpi/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import {
  ListPager,
  ListSearch,
  useListControls,
  usePrinting,
} from '@/components/list-controls';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  consolidatedReportQuery,
  downloadExport,
} from '@/features/annual/queries';
import { AnnualResultView } from '@/features/annual/result-view';
import { formatDateTime } from '@/lib/dates';

/**
 * Paged on screen (the report can cover every institution); printing expands to the whole
 * report so the printed copy stays complete.
 */
function ReportBody({ data }: { data: ConsolidatedReport }) {
  const printing = usePrinting();
  const unreleased = useListControls(
    data.unreleased,
    (row) => `${row.institutionId} ${row.institutionName}`,
    25,
  );
  const released = useListControls(
    data.released,
    (result) => `${result.institutionId} ${result.institutionName}`,
    10,
  );
  return (
    <>
      {data.unreleased.length > 0 && (
        <section
          aria-labelledby="unreleased-heading"
          className="grid gap-3 rounded-lg border bg-card p-5"
        >
          <h2 id="unreleased-heading" className="font-semibold">
            Not released ({data.unreleased.length})
          </h2>
          {data.unreleased.length > unreleased.pageSize && (
            <div data-print-hide>
              <ListSearch
                controls={unreleased}
                label="Find an unreleased institution"
                placeholder="ID or name"
              />
            </div>
          )}
          <ul className="grid gap-3 text-sm">
            {(printing ? data.unreleased : unreleased.visible).map((row) => (
              <li key={row.institutionId} className="break-inside-avoid">
                <span className="font-medium">{row.institutionId}</span>{' '}
                {row.institutionName}
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {row.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div data-print-hide>
            <ListPager controls={unreleased} noun="institutions" />
          </div>
        </section>
      )}
      {data.released.length > released.pageSize && (
        <div data-print-hide>
          <ListSearch
            controls={released}
            label="Find a released result"
            placeholder="ID or name"
          />
        </div>
      )}
      {(printing ? data.released : released.visible).map((result) => (
        <section
          key={result.id}
          aria-labelledby={`rel-${result.id}`}
          className="grid gap-3 break-inside-avoid"
        >
          <h2 id={`rel-${result.id}`} className="text-lg font-semibold">
            {result.institutionId} {result.institutionName}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              · version {result.version}, published{' '}
              {formatDateTime(result.publishedAt)}
            </span>
          </h2>
          <AnnualResultView
            evaluation={result.evaluation}
            profileName={result.profileName}
            simulation={result.simulation}
          />
        </section>
      ))}
      <div data-print-hide>
        <ListPager controls={released} noun="released results" />
      </div>
    </>
  );
}

export function ReportsPage() {
  const report = useQuery(consolidatedReportQuery);
  const csv = useMutation({
    mutationFn: () =>
      downloadExport('/api/annual/report.csv', 'cpi-consolidated-results.csv'),
  });
  function downloadJson() {
    if (!report.data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report.data, null, 2)], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cpi-consolidated-results.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Oversight"
        title="Consolidated annual report"
        description="Released results with their explanation, and every unreleased institution with its reason. Exports follow the versioned cpi-export-1 schema."
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              Print
            </Button>
            <Button
              variant="outline"
              onClick={() => csv.mutate()}
              disabled={csv.isPending}
            >
              <Download aria-hidden="true" />
              CSV
            </Button>
            <Button
              variant="outline"
              onClick={downloadJson}
              disabled={!report.data}
            >
              <Download aria-hidden="true" />
              JSON
            </Button>
          </>
        }
      />
      <Alert>
        <AlertDescription>
          Exports are for a labelled mock consumer. No claim is made that EACC
          or PSPMU has accepted this format or approved an integration.
        </AlertDescription>
      </Alert>
      <QueryView query={report} label="consolidated report">
        {(data) => (
          <div className="grid gap-8">
            <p className="text-sm text-muted-foreground">
              {data.cycleLabel} · {data.profileName}
              {data.simulation &&
                ' (simulation profile, not official EACC scoring)'}{' '}
              · generated {formatDateTime(data.generatedAt)} ·{' '}
              {data.released.length} of{' '}
              {data.released.length + data.unreleased.length} institutions
              released
            </p>
            <ReportBody data={data} />
          </div>
        )}
      </QueryView>
      {csv.isError && (
        <p role="alert" className="text-sm text-destructive">
          {csv.error.message}
        </p>
      )}
    </div>
  );
}
