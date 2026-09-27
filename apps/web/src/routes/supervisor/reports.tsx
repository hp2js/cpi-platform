import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
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
            {data.unreleased.length > 0 && (
              <section
                aria-labelledby="unreleased-heading"
                className="rounded-lg border bg-card p-5"
              >
                <h2 id="unreleased-heading" className="font-semibold">
                  Not released
                </h2>
                <ul className="mt-3 grid gap-3 text-sm">
                  {data.unreleased.map((row) => (
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
              </section>
            )}
            {data.released.map((result) => (
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
