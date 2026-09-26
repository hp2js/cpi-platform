import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { inboxQuery } from '@/features/events/queries';
import { cn } from '@/lib/utils';

type InboxPath = '/institution/inbox' | '/officer/inbox' | '/supervisor/inbox';

/** Header link to the role's inbox; the unread count is text, not only a coloured dot. */
export function InboxLink({
  to,
  tone = 'light',
}: {
  to: InboxPath;
  tone?: 'light' | 'dark';
}) {
  const inbox = useQuery(inboxQuery);
  const unread = inbox.data?.unread ?? 0;
  return (
    <Link
      data-print-hide
      to={to}
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium',
        tone === 'dark'
          ? 'text-primary-foreground hover:bg-white/10'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Bell className="size-4" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">Inbox</span>
      {unread > 0 && (
        <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
          {unread}
          <span className="sr-only"> unread</span>
        </span>
      )}
    </Link>
  );
}
