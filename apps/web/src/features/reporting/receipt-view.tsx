import type { Receipt } from '@cpi/contracts';
import { FileText } from 'lucide-react';
import { evidenceCategoryLabel, formatBytes } from './answers';
import { formatDateTime } from '@/lib/dates';

/** The immutable acknowledgement of one submitted revision (FR07). No score is shown. */
export function ReceiptView({ receipt }: { receipt: Receipt }) {
  const rows: [string, React.ReactNode][] = [
    ['Institution', `${receipt.institutionName} (${receipt.institutionId})`],
    ['Reporting period', receipt.periodLabel],
    ['Revision', receipt.revision],
    ['Received (business time)', formatDateTime(receipt.receivedAt)],
    ['Deadline', formatDateTime(receipt.deadline)],
    [
      'Timeliness',
      receipt.timeliness === 'on_time'
        ? 'On time'
        : `Late by ${receipt.daysLate} ${receipt.daysLate === 1 ? 'day' : 'days'}; no penalty is applied in this demonstration`,
    ],
    [
      'Evidence',
      receipt.evidenceComplete
        ? 'Every required document supplied'
        : 'Incomplete: some documents declared unavailable (listed below)',
    ],
    ['Submitted by', `${receipt.submittedBy}, ${receipt.submitterRole}`],
    [
      'Institutional approval',
      receipt.approval.kind === 'reference'
        ? receipt.approval.reference
        : `Not available: ${receipt.approval.explanation}`,
    ],
    ['Receipt reference', receipt.id],
    ['Recorded (actual time)', formatDateTime(receipt.recordedAt)],
  ];
  return (
    <div className="grid gap-6">
      <dl className="grid gap-x-6 gap-y-3 rounded-lg border bg-card p-5 text-sm sm:grid-cols-[14rem_1fr]">
        {rows.map(([term, detail]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-medium break-words">{detail}</dd>
          </div>
        ))}
      </dl>
      <section
        aria-labelledby="calculation-heading"
        className="rounded-lg border bg-card p-5"
      >
        <h2 id="calculation-heading" className="font-semibold">
          Evaluation status
        </h2>
        <p className="mt-1 text-sm">
          {receipt.calculation === 'recorded'
            ? 'A provisional calculation was recorded with this submission. Scores are released only after annual evaluation and publication.'
            : 'Pending baseline approval: the implementation result will be calculated once your officer approves the baseline. This is not a zero score.'}
        </p>
      </section>
      <section
        aria-labelledby="inventory-heading"
        className="rounded-lg border bg-card p-5"
      >
        <h2 id="inventory-heading" className="font-semibold">
          Evidence inventory
        </h2>
        {receipt.evidence.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No files were attached.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 text-sm">
            {receipt.evidence.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-2">
                <FileText
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="font-medium">{item.fileName}</span>
                <span className="text-muted-foreground">
                  {evidenceCategoryLabel[item.category]} ·{' '}
                  {formatBytes(item.sizeBytes)} · SHA-256{' '}
                  {item.sha256.slice(0, 12)}…
                </span>
              </li>
            ))}
          </ul>
        )}
        {receipt.declaredUnavailable.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Declarations</h3>
            <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm">
              {receipt.declaredUnavailable.map((item) => (
                <li key={`${item.field}-${item.message}`}>
                  <span className="font-medium">{item.label}</span>:{' '}
                  {item.message}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
