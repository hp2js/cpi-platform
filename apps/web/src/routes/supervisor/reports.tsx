import type {
  ConsolidatedReport,
  ConsolidatedSummaryRow,
} from '@cpi/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileDown, Printer } from 'lucide-react';
import {
  ListPager,
  ListSearch,
  useListControls,
  usePrinting,
} from '@/components/list-controls';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { EarlierYears } from '@/features/years/earlier-years';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  consolidatedReportQuery,
  downloadDocument,
  downloadExport,
} from '@/features/annual/queries';
import { AnnualResultView } from '@/features/annual/result-view';
import { reportIdentityQuery } from '@/features/report-identity/queries';
import {
  ReportCover,
  ReportSignoff,
} from '@/features/report-identity/report-identity';
import { formatDateTime } from '@/lib/dates';

/** One quarter's points in the summary, with its status in words where there are none. */
function quarterCell(quarter: ConsolidatedSummaryRow['quarters'][number]) {
  const value =
    quarter.status === 'closed_without_submission'
      ? `${quarter.points ?? '0.00'} (closed)`
      : (quarter.points ?? 'Pending');
  return quarter.late ? `${value} (late)` : value;
}

/** The method, stated once for the whole report (PRD §10.5, §10.7). */
function Method({ data }: { data: ConsolidatedReport }) {
  const { weights } = data;
  const quarterMax = weights.implementation / 4;
  return (
    <section
      aria-labelledby="method-heading"
      className="grid gap-2 rounded-lg border bg-white p-5 text-sm"
      data-print-keep
    >
      <h2 id="method-heading" className="text-lg font-bold">
        How results are calculated
      </h2>
      <p>
        Annual result out of 100 = procedures ({weights.procedures}) + risk
        assessment ({weights.riskAssessment}) + mitigation plan (
        {weights.mitigationPlan}) + implementation ({weights.implementation} ×
        the average of four quarters, each worth{' '}
        {Number.isInteger(quarterMax) ? quarterMax : quarterMax.toFixed(2)}{' '}
        points). Foundations count once, from the version effective at the
        evaluation cutoff; quarters are never re-weighted over the ones
        reported.
      </p>
      <p>
        {data.profileName}
        {data.simulation && ': a simulation profile, not official EACC scoring'}
        . Late reporting is shown separately; no late penalty is applied in this
        demonstration. Scores measure performance against each
        institution&rsquo;s own accepted plan, not equal prevention impact, so
        institutions are listed by ID and never ranked.
      </p>
    </section>
  );
}

function Publication({ data }: { data: ConsolidatedReport }) {
  return (
    <section
      aria-labelledby="publication-heading"
      className="grid gap-2 rounded-lg border bg-white p-5 text-sm"
      data-print-keep
    >
      <h2 id="publication-heading" className="text-lg font-bold">
        Publication
      </h2>
      {data.batches.length === 0 ? (
        <p>No result has been published yet.</p>
      ) : (
        <ul className="grid gap-1">
          {data.batches.map((batch) => (
            <li key={batch.batchId}>
              Batch <span className="font-mono">{batch.batchId}</span>,
              published {formatDateTime(batch.publishedAt)} by{' '}
              {batch.publishedBy}: {batch.institutions}{' '}
              {batch.institutions === 1 ? 'institution' : 'institutions'}
            </li>
          ))}
        </ul>
      )}
      <h3 className="font-bold">Corrections since first release</h3>
      {data.corrections.length === 0 ? (
        <p>None.</p>
      ) : (
        <ul className="grid gap-1">
          {data.corrections.map((correction) => (
            <li key={`${correction.institutionId}-${correction.toVersion}`}>
              <span className="font-bold">{correction.institutionId}</span>{' '}
              {correction.institutionName}: version {correction.fromVersion} →{' '}
              {correction.toVersion}, {formatDateTime(correction.publishedAt)}{' '}
              by {correction.publishedBy}. Reason: {correction.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Coverage({ data }: { data: ConsolidatedReport }) {
  return (
    <section aria-labelledby="coverage-heading" className="grid gap-3">
      <h2 id="coverage-heading" className="text-lg font-bold">
        Coverage
      </h2>
      <ul className="grid gap-3 tablet:grid-cols-2 widescreen:grid-cols-3">
        {data.coverage.map((metric) => (
          <li
            key={metric.id}
            className="grid gap-1 rounded-lg border bg-white p-4 text-sm"
            data-print-keep
          >
            <p className="font-bold">{metric.label}</p>
            <p className="text-lg font-bold tabular-nums">
              {metric.percent === null
                ? 'Not applicable'
                : `${metric.percent}%`}
            </p>
            <p className="tabular-nums">
              {metric.numerator} of {metric.denominator}
            </p>
            <p className="text-xs text-base-dark">{metric.definition}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Every expected institution at a glance, by ID; searchable and paged on screen. */
function Summary({ data }: { data: ConsolidatedReport }) {
  const printing = usePrinting();
  const controls = useListControls(
    data.summary,
    (row) => `${row.institutionId} ${row.institutionName}`,
    25,
  );
  const labels = data.released[0]?.evaluation.quarters.map(
    (quarter) => quarter.periodLabel,
  ) ?? ['Q1', 'Q2', 'Q3', 'Q4'];
  return (
    <section aria-labelledby="summary-heading" className="grid gap-3">
      <h2 id="summary-heading" className="text-lg font-bold">
        Summary of all institutions
      </h2>
      <p className="text-sm text-base-dark">
        Every expected institution, listed by institution ID and not ranked.
      </p>
      {data.summary.length > controls.pageSize && (
        <div data-print-hide>
          <ListSearch
            controls={controls}
            label="Find an institution"
            placeholder="ID or name"
          />
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table className="min-w-[60rem]">
          <TableCaption className="sr-only">
            Annual results of every expected institution, by institution ID
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Institution</TableHead>
              <TableHead scope="col">Annual result</TableHead>
              <TableHead scope="col">Foundations</TableHead>
              {labels.map((label) => (
                <TableHead key={label} scope="col">
                  {label}
                </TableHead>
              ))}
              <TableHead scope="col">Late quarters</TableHead>
              <TableHead scope="col">Reviewing officer</TableHead>
              <TableHead scope="col">Version</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(printing ? data.summary : controls.visible).map((row) => (
              <TableRow key={row.institutionId}>
                <TableHead
                  scope="row"
                  className="font-normal whitespace-normal"
                >
                  <span className="font-bold">{row.institutionId}</span>
                  <span className="block text-xs text-base-dark">
                    {row.institutionName}
                  </span>
                </TableHead>
                {row.released ? (
                  <>
                    <TableCell className="font-bold tabular-nums">
                      {row.points ?? 'Pending'}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.foundationPoints ?? '—'}
                    </TableCell>
                    {row.quarters.map((quarter) => (
                      <TableCell
                        key={quarter.periodLabel}
                        className="tabular-nums"
                      >
                        {quarterCell(quarter)}
                      </TableCell>
                    ))}
                    <TableCell className="tabular-nums">
                      {row.lateQuarters}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {row.officerName}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {row.version}
                      {row.publishedAt && (
                        <span className="block text-xs text-base-dark">
                          {formatDateTime(row.publishedAt)}
                        </span>
                      )}
                    </TableCell>
                  </>
                ) : (
                  <TableCell
                    colSpan={labels.length + 6}
                    className="whitespace-normal"
                  >
                    <span className="font-bold">Not released:</span>{' '}
                    {row.reasons.join('; ')}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div data-print-hide>
        <ListPager controls={controls} noun="institutions" />
      </div>
    </section>
  );
}

/**
 * The consolidated report (HP2-66): method once, publication and corrections, coverage, a
 * summary of every institution, then each released institution's detail as an appendix.
 * Paged on screen; printing expands to the whole report so the printed copy stays complete.
 */
function ReportBody({ data }: { data: ConsolidatedReport }) {
  const printing = usePrinting();
  const released = useListControls(
    data.released,
    (result) => `${result.institutionId} ${result.institutionName}`,
    10,
  );
  return (
    <>
      <Method data={data} />
      <Publication data={data} />
      <Coverage data={data} />
      <Summary data={data} />
      {data.released.length > 0 && (
        <section
          aria-labelledby="detail-heading"
          className="grid gap-6"
          data-print-break-before
        >
          <div>
            <h2 id="detail-heading" className="text-lg font-bold">
              Institution detail
            </h2>
            <p className="text-sm text-base-dark">
              Each released result with its foundations, quarters, reviewers and
              reasons. The method above applies to all of them.
            </p>
          </div>
          {data.released.length > released.pageSize && (
            <div data-print-hide>
              <ListSearch
                controls={released}
                label="Find a released result"
                placeholder="ID or name"
              />
            </div>
          )}
          {(printing ? data.released : released.visible).map(
            (result, index) => (
              <section
                key={result.id}
                aria-labelledby={`rel-${result.id}`}
                // In print each institution starts on its own page.
                data-print-break-before={index > 0 || undefined}
                className="grid gap-3"
              >
                <h3 id={`rel-${result.id}`} className="text-lg font-bold">
                  {result.institutionId} {result.institutionName}{' '}
                  <span className="text-sm font-normal text-base-dark">
                    · version {result.version}, published{' '}
                    {formatDateTime(result.publishedAt)}
                  </span>
                </h3>
                <AnnualResultView
                  evaluation={result.evaluation}
                  profileName={result.profileName}
                  simulation={result.simulation}
                  methodNote={false}
                />
              </section>
            ),
          )}
          <div data-print-hide>
            <ListPager controls={released} noun="released results" />
          </div>
        </section>
      )}
    </>
  );
}

export function ReportsPage() {
  const report = useQuery(consolidatedReportQuery);
  // The latest release's identity; before any release, the identity in force (HP2-65).
  const current = useQuery(reportIdentityQuery);
  const pdf = useMutation({
    mutationFn: () => downloadDocument('/api/annual/report.pdf'),
  });
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
        description="The year at a glance: method, publication, coverage and every institution's result, then each released result in detail. Exports follow the versioned cpi-export-1 schema."
        screenOnlyDescription
        actions={
          <>
            <Button
              variant="plain"
              onClick={() => pdf.mutate()}
              disabled={pdf.isPending}
            >
              <FileDown aria-hidden="true" />
              Download PDF
            </Button>
            <Button variant="plain" onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              Print
            </Button>
            <Button
              variant="plain"
              onClick={() => csv.mutate()}
              disabled={csv.isPending}
            >
              <Download aria-hidden="true" />
              CSV
            </Button>
            <Button
              variant="plain"
              onClick={downloadJson}
              disabled={!report.data}
            >
              <Download aria-hidden="true" />
              JSON
            </Button>
          </>
        }
      />
      <Alert data-print-hide>
        <AlertDescription>
          Exports are for a labelled mock consumer. No claim is made that EACC
          or PSPMU has accepted this format or approved an integration.
        </AlertDescription>
      </Alert>
      <QueryView query={report} label="consolidated report">
        {(data) => (
          <div className="grid gap-8">
            <p className="text-sm text-base-dark">
              {data.cycleLabel} · {data.profileName}
              {data.simulation &&
                ' (simulation profile, not official EACC scoring)'}{' '}
              · generated {formatDateTime(data.generatedAt)} ·{' '}
              {data.released.length} of{' '}
              {data.released.length + data.unreleased.length} institutions
              released
            </p>
            {(data.released.at(-1)?.identity ?? current.data) && (
              <ReportCover
                identity={(data.released.at(-1)?.identity ?? current.data)!}
                cycleLabel={data.cycleLabel}
                subject="Consolidated report on all institutions"
              />
            )}
            <ReportBody data={data} />
            {(data.released.at(-1)?.identity ?? current.data) && (
              <ReportSignoff
                identity={(data.released.at(-1)?.identity ?? current.data)!}
              />
            )}
          </div>
        )}
      </QueryView>
      {pdf.isError && (
        <p role="alert" className="text-sm text-error-dark">
          The document could not be downloaded. Try again.
        </p>
      )}
      {csv.isError && (
        <p role="alert" className="text-sm text-error-dark">
          {csv.error.message}
        </p>
      )}
      <EarlierYears />
    </div>
  );
}
