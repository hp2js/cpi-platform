import { compareResults, type PublishedResult } from '@cpi/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { QueryView } from '@/components/query-view';
import { cycleQuery } from '@/features/directory/queries';
import { FileDown, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ReportCover,
  ReportSignoff,
} from '@/features/report-identity/report-identity';
import { formatDateTime } from '@/lib/dates';
import { downloadDocument, institutionResultsQuery } from './queries';
import { AnnualResultView } from './result-view';

/** The published result in full, as released: cover, explanation and sign-off. */
function FullResult({
  result,
  cycleLabel,
}: {
  result: PublishedResult;
  cycleLabel: string;
}) {
  return (
    <div className="grid gap-4">
      <ReportCover
        identity={result.identity}
        cycleLabel={cycleLabel}
        subject={`${result.institutionId} · ${result.institutionName}`}
      />
      <AnnualResultView
        evaluation={result.evaluation}
        profileName={result.profileName}
        simulation={result.simulation}
      />
      <ReportSignoff identity={result.identity} />
    </div>
  );
}

/** What a correction changed, from the earlier version to this one (HP2-68). */
function Changes({
  earlier,
  later,
}: {
  earlier: PublishedResult;
  later: PublishedResult;
}) {
  const changes = compareResults(earlier, later);
  return (
    <section
      aria-labelledby={`changes-${later.id}`}
      className="grid gap-2 rounded-lg border bg-white p-4 text-sm"
      data-print-keep
    >
      <h3 id={`changes-${later.id}`} className="font-bold">
        What changed from version {earlier.version}
      </h3>
      {later.correctionReason && (
        <p>
          <span className="text-base-dark">Correction reason: </span>
          {later.correctionReason}
        </p>
      )}
      {changes.length === 0 ? (
        <p>No figures changed.</p>
      ) : (
        <ul className="grid gap-1">
          {changes.map((change) => (
            <li key={change.item}>
              <span className="font-bold">{change.item}:</span> {change.before}{' '}
              → {change.after}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Every published version of one institution's result (FR13, AT20, HP2-68): the current one in
 * full and first; each earlier one readable in full, marked as superseded and by what, with
 * what the correction changed. Each version can be printed and downloaded.
 */
export function PublishedResults({
  results,
  cycleLabel,
}: {
  /** Newest first, as the API returns them. */
  results: PublishedResult[];
  cycleLabel: string;
}) {
  const pdf = useMutation({
    mutationFn: (publicationId: string) =>
      downloadDocument(
        `/api/publications/${encodeURIComponent(publicationId)}/report.pdf`,
      ),
  });
  return (
    <div className="grid gap-8">
      {results.map((result, index) => {
        const replacedBy = results[index - 1];
        const earlier = results[index + 1];
        const heading = (
          <div>
            <h2 id={`result-${result.id}`} className="text-lg font-bold">
              Version {result.version}{' '}
              {result.status === 'current' ? '(current)' : '(superseded)'}
            </h2>
            <p className="text-sm text-base-dark">
              Published {formatDateTime(result.publishedAt)} by{' '}
              {result.publishedBy} · batch {result.batchId}
              {result.correctionReason &&
                ` · correction: ${result.correctionReason}`}
            </p>
            <Button
              variant="plain"
              size="sm"
              className="mt-1"
              data-print-hide
              onClick={() => pdf.mutate(result.id)}
              disabled={pdf.isPending}
            >
              <FileDown aria-hidden="true" />
              Download PDF
              <span className="sr-only"> of version {result.version}</span>
            </Button>
          </div>
        );
        return result.status === 'current' ? (
          <section
            key={result.id}
            aria-labelledby={`result-${result.id}`}
            className="grid gap-4"
          >
            {heading}
            {earlier && <Changes earlier={earlier} later={result} />}
            <FullResult result={result} cycleLabel={cycleLabel} />
          </section>
        ) : (
          <section
            key={result.id}
            aria-labelledby={`result-${result.id}`}
            className="grid gap-4"
            data-print-break-before
          >
            {heading}
            <p className="flex items-start gap-2 rounded-md border-l-8 border-l-base-dark bg-base-lightest p-3 text-sm">
              <History className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-bold">
                  Superseded by version {replacedBy?.version} on{' '}
                  {replacedBy ? formatDateTime(replacedBy.publishedAt) : '—'}
                  {replacedBy?.correctionReason
                    ? `: ${replacedBy.correctionReason}`
                    : ''}
                </span>
                . Kept on record exactly as it was published.
              </span>
            </p>
            {earlier && <Changes earlier={earlier} later={result} />}
            <details>
              <summary className="cursor-pointer font-bold" data-print-hide>
                Read version {result.version} in full
              </summary>
              <div className="mt-4">
                <FullResult result={result} cycleLabel={cycleLabel} />
              </div>
            </details>
          </section>
        );
      })}
      {pdf.isError && (
        <p role="alert" className="text-sm text-error-dark">
          The document could not be downloaded. Try again.
        </p>
      )}
    </div>
  );
}

/** The published versions section on staff pages for one institution (HP2-68). */
export function InstitutionPublishedResults({
  institutionId,
}: {
  institutionId: string;
}) {
  const results = useQuery(institutionResultsQuery(institutionId));
  const cycle = useQuery(cycleQuery);
  return (
    <section aria-labelledby="published-results-heading" className="grid gap-4">
      <h2 id="published-results-heading" className="text-lg font-bold">
        Published results
      </h2>
      <QueryView query={results} label="published results">
        {(data) =>
          data.results.length === 0 ? (
            <p className="text-sm text-base-dark">{data.message}</p>
          ) : (
            <PublishedResults
              results={data.results}
              cycleLabel={cycle.data?.label ?? ''}
            />
          )
        }
      </QueryView>
    </section>
  );
}
