import type { Notification } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
import {
  eventKeys,
  inboxQuery,
  markAllRead,
  markRead,
} from '@/features/events/queries';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

function Item({ notification }: { notification: Notification }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const open = useMutation({
    mutationFn: async () => {
      if (!notification.readAt) await markRead(notification.id);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: eventKeys.inbox });
      if (notification.link) await navigate({ href: notification.link });
    },
  });
  return (
    <li
      className={cn(
        'grid gap-1 rounded-lg border bg-white p-4',
        !notification.readAt && 'border-primary-dark',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">
          {!notification.readAt && (
            <span className="mr-2 rounded-md bg-primary px-2 py-1 text-xs text-white">
              New<span className="sr-only">:</span>
            </span>
          )}{' '}
          {notification.title}
        </h2>
        <time
          dateTime={notification.createdAt}
          className="text-xs text-base-dark"
        >
          {formatDateTime(notification.createdAt)}
        </time>
      </div>
      <p className="text-sm text-base-dark">{notification.body}</p>
      {(notification.link || !notification.readAt) && (
        <div className="mt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => open.mutate()}
            disabled={open.isPending}
            aria-label={`${notification.link ? 'Open' : 'Mark as read'}: ${notification.title}`}
          >
            {notification.link ? 'Open' : 'Mark as read'}
          </Button>
        </div>
      )}
    </li>
  );
}

export function InboxPage() {
  const queryClient = useQueryClient();
  const inbox = useQuery(inboxQuery);
  const readAll = useMutation({
    mutationFn: markAllRead,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: eventKeys.inbox }),
  });
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Inbox"
        description="Notifications about your work. Messages never include evidence or unreleased scores."
        actions={
          <Button
            variant="outline"
            onClick={() => readAll.mutate()}
            disabled={!inbox.data?.unread || readAll.isPending}
          >
            <CheckCheck aria-hidden="true" />
            Mark all as read
          </Button>
        }
      />
      <QueryView
        query={inbox}
        label="notifications"
        isEmpty={(data) => data.items.length === 0}
        empty="You have no notifications."
      >
        {(data) => (
          <ul
            className="grid gap-3"
            aria-label={`${data.unread} unread of ${data.items.length}`}
          >
            {data.items.map((notification) => (
              <Item key={notification.id} notification={notification} />
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}
