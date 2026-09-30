import type { Clarification } from '@cpi/contracts';
import {
  CalendarClock,
  MessageCircleQuestion,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDateTime, formatDays } from '@/lib/dates';
import { cn } from '@/lib/utils';

const statusLabel: Record<Clarification['status'], string> = {
  open: 'Awaiting your response',
  responded: 'Responded',
  closed_unanswered: 'Closed without response',
};

/** One clarification request: the questions, the evidence asked for, and its response window. */
export function ClarificationCard({
  clarification,
  audience,
  actions,
}: {
  clarification: Clarification;
  audience: 'institution' | 'officer';
  actions?: ReactNode;
}) {
  const status =
    audience === 'officer' && clarification.status === 'open'
      ? 'Awaiting institution response'
      : statusLabel[clarification.status];
  return (
    <article
      aria-labelledby={`clar-${clarification.id}`}
      className={cn(
        'grid gap-4 rounded-lg border bg-white p-5',
        clarification.status === 'open' && 'border-ink',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id={`clar-${clarification.id}`}
            className="flex items-center gap-2 font-bold"
          >
            <MessageCircleQuestion
              className="size-5 text-primary"
              aria-hidden="true"
            />
            {clarification.periodLabel} clarification on revision{' '}
            {clarification.revision}
          </h3>
          <p className="mt-1 text-sm text-base-dark">
            Requested by {clarification.requestedBy},{' '}
            {formatDateTime(clarification.requestedAt)}
          </p>
        </div>
        <span className="rounded-sm bg-base-lightest px-2 py-1 text-xs font-bold">
          {status}
        </span>
      </header>
      <ol className="grid gap-3">
        {clarification.items.map((item, index) => (
          <li
            key={index}
            className="grid gap-1 rounded-md bg-base-lightest p-3 text-sm"
          >
            <p className="font-bold">{item.criterion}</p>
            <p>{item.question}</p>
            {item.requestedEvidence && (
              <p className="text-base-dark">
                <span className="font-bold text-ink">Evidence requested: </span>
                {item.requestedEvidence}
              </p>
            )}
          </li>
        ))}
      </ol>
      <div className="grid gap-1 text-sm">
        <p className="flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" aria-hidden="true" />
          Respond by{' '}
          <time dateTime={clarification.responseDueAt} className="font-bold">
            {formatDateTime(clarification.responseDueAt)}
          </time>
        </p>
        <p className="text-xs text-base-dark">
          {formatDays(clarification.windowDays, clarification.windowUnit)} from
          when the request was available and notified (
          {formatDateTime(clarification.notifiedAt)}). The window is for
          evidence and explanations; it does not extend the time to complete the
          work itself.
        </p>
        {clarification.overdue && (
          <p className="flex items-center gap-2 font-bold text-error-dark">
            <TriangleAlert className="size-4" aria-hidden="true" />
            The response window has passed.
          </p>
        )}
        {clarification.extensionRequired && (
          <p className="flex items-center gap-2 font-bold">
            <TriangleAlert className="size-4" aria-hidden="true" />
            Extension decision required: the window ends after the evaluation
            cutoff, so the result stays pending until an authorized decision.
          </p>
        )}
        {clarification.response && (
          <p>
            Answered by revision {clarification.response.revision},{' '}
            {formatDateTime(clarification.response.submittedAt)}. A timely
            response waits for officer review; it is not counted as
            non-response.
          </p>
        )}
        {clarification.closure && (
          <p>
            Closed without response by {clarification.closure.by},{' '}
            {formatDateTime(clarification.closure.at)}:{' '}
            {clarification.closure.reason}
          </p>
        )}
      </div>
      {actions}
    </article>
  );
}
