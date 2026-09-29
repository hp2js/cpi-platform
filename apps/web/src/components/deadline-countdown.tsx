import { AlarmClock, Clock, Hourglass } from 'lucide-react';
import { useSession } from '@/features/session/use-session';
import { deadlineCountdown } from '@/lib/dates';
import { cn } from '@/lib/utils';

const styles = {
  late: 'border-error-dark bg-error-dark text-error-dark',
  today: 'border-warning bg-warning-lighter text-ink',
  soon: 'border-warning bg-warning-lighter text-ink',
  later: 'border-base-lighter bg-base-lightest text-base-dark',
} as const;

/**
 * Time left before a deadline, measured from simulated business time. The words carry the
 * meaning; colour only reinforces it (PRD §11).
 */
export function DeadlineCountdown({
  deadline,
  className,
}: {
  deadline: string;
  className?: string;
}) {
  const session = useSession();
  const { label, tone } = deadlineCountdown(
    deadline,
    session.clock.businessTime,
  );
  const Icon =
    tone === 'late' ? AlarmClock : tone === 'later' ? Clock : Hourglass;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold whitespace-nowrap',
        styles[tone],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
