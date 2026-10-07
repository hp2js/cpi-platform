import type { ReportBundle } from '@cpi/contracts';
import { Link } from '@tanstack/react-router';
import { CalendarClock, FileClock, Lock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';

const linkClass = buttonVariants({
  variant: 'plain',
  size: 'sm',
  className: 'mt-2',
});

/**
 * Why a quarter's report cannot be edited, from what the server recorded (HP2-47): closed
 * without submission, submitted, form not published, or not open yet. A closed quarter never
 * reads as one that will open later.
 */
export function ReportUnavailable({ bundle }: { bundle: ReportBundle }) {
  const { period, obligation, closure } = bundle;
  if (obligation.state === 'closed_without_submission')
    return (
      <Alert>
        <Lock aria-hidden="true" />
        <AlertTitle>{period.label} was closed without submission</AlertTitle>
        <AlertDescription>
          <p>
            Your officer recorded that no report was received for {period.label}{' '}
            after the evaluation cutoff
            {closure ? (
              <>
                {' '}
                ({closure.by}, {formatDateTime(closure.at)}). Their reason:{' '}
                &ldquo;{closure.reason}&rdquo;
              </>
            ) : (
              '.'
            )}
          </p>
          <p className="mt-2">
            No report can be submitted for this quarter now, and it will not
            reopen by itself. Its implementation points are recorded as zero. If
            you believe this is wrong, contact your officer: a change goes
            through the administrator&rsquo;s controlled correction process.
          </p>
          {bundle.resultPublished && (
            <Link to="/institution/results" className={linkClass}>
              See your published result
            </Link>
          )}
        </AlertDescription>
      </Alert>
    );
  const receipt = bundle.receipts.at(-1);
  if (receipt)
    return (
      <Alert>
        <Lock aria-hidden="true" />
        <AlertTitle>
          Revision {receipt.revision} was submitted and cannot be changed
        </AlertTitle>
        <AlertDescription>
          <p>
            Submitted revisions are kept exactly as received. If the reviewing
            officer asks for clarification, you will be able to submit a new
            revision.
          </p>
          <Link
            to="/institution/receipts/$receiptId"
            params={{ receiptId: receipt.id }}
            className={linkClass}
          >
            View receipt
          </Link>
        </AlertDescription>
      </Alert>
    );
  if (!bundle.form)
    return (
      <Alert>
        <FileClock aria-hidden="true" />
        <AlertTitle>The report form has not been published yet</AlertTitle>
        <AlertDescription>
          You will be notified when the administrator publishes it. Nothing is
          needed from you yet.
        </AlertDescription>
      </Alert>
    );
  if (obligation.flags.includes('not_yet_due'))
    return (
      <Alert>
        <CalendarClock aria-hidden="true" />
        <AlertTitle>This report is not open yet</AlertTitle>
        <AlertDescription>
          Reporting opens after the quarter ends on{' '}
          {formatCalendarDate(period.endsOn)}. Nothing is needed from you yet.
        </AlertDescription>
      </Alert>
    );
  return (
    <Alert>
      <Lock aria-hidden="true" />
      <AlertTitle>This report cannot be changed now</AlertTitle>
      <AlertDescription>
        It is with your officer. You will be notified if anything is needed from
        you.
      </AlertDescription>
    </Alert>
  );
}
