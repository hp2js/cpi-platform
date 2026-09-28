import { AlarmClock, Clock, Hourglass } from 'lucide-react';
import { useSession } from '@/features/session/use-session';
import { deadlineCountdown } from '@/lib/dates';
import { cn } from '@/lib/utils';

const styles = {
  late: 'border-destructive/40 bg-destructive/10 text-destructive',
  today:
    'border-amber-500/50 bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100',
  soon: 'border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100',
  later: 'border-border bg-muted text-muted-foreground',
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
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        styles[tone],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
