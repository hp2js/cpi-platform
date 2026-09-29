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
        'relative inline-flex min-h-touch items-center gap-2 px-3 py-2 text-sm font-bold no-underline',
        tone === 'dark'
          ? 'text-white hover:bg-white/10'
          : 'text-ink hover:bg-base-lightest hover:text-primary',
      )}
    >
      <Bell className="size-5" aria-hidden="true" />
      <span className="sr-only tablet:not-sr-only">Inbox</span>
      {unread > 0 && (
        <span className="rounded-full bg-secondary-dark px-2 text-2xs font-bold text-white tabular-nums">
          {unread}
          <span className="sr-only"> unread</span>
        </span>
      )}
    </Link>
  );
}
