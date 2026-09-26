import type { Delivery } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCcw } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  deliveriesQuery,
  emailSinkQuery,
  invalidateEvents,
  retryDelivery,
} from '@/features/events/queries';
import { formatDateTime } from '@/lib/dates';

const statusLabel: Record<Delivery['status'], string> = {
  queued: 'Queued',
  delivered: 'Delivered',
  retrying: 'Retrying',
  failed: 'Failed after retries',
};

function DeliveryTable({
  deliveries,
  caption,
  retry,
}: {
  deliveries: Delivery[];
  caption: string;
  retry?: boolean;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: retryDelivery,
    onSuccess: async () => {
      await Promise.all([
        invalidateEvents(queryClient),
        queryClient.invalidateQueries({ queryKey: ['email-sink'] }),
      ]);
    },
  });
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table className="min-w-[52rem]">
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Message</TableHead>
            <TableHead scope="col">Recipient</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Attempts</TableHead>
            <TableHead scope="col">Last attempt</TableHead>
            {retry && <TableHead scope="col">Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliveries.map((delivery) => (
            <TableRow key={delivery.id}>
              <TableHead
                scope="row"
                className="h-auto py-2 font-normal whitespace-normal"
              >
                <span className="font-medium">{delivery.subject}</span>
                <span className="block text-xs text-muted-foreground">
                  {delivery.eventType}
                </span>
              </TableHead>
              <TableCell className="text-sm">
                {delivery.recipientName}
                <span className="block text-xs text-muted-foreground">
                  {delivery.recipientEmail}
                </span>
              </TableCell>
              <TableCell className="text-sm">
                {statusLabel[delivery.status]}
                {delivery.lastError && (
                  <span className="block text-xs text-destructive">
                    {delivery.lastError}
                  </span>
                )}
              </TableCell>
              <TableCell className="tabular-nums">
                {delivery.attempts}
              </TableCell>
              <TableCell className="text-sm">
                {delivery.lastAttemptAt
                  ? formatDateTime(delivery.lastAttemptAt)
                  : '—'}
              </TableCell>
              {retry && (
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate(delivery.id)}
                  >
                    <RefreshCcw aria-hidden="true" />
                    Retry
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {mutation.isError && (
        <p role="alert" className="p-3 text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const failed = useQuery(deliveriesQuery('failed'));
  const all = useQuery(deliveriesQuery(null));
  const sink = useQuery(emailSinkQuery);
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Operations"
        title="Notification delivery"
        description="In-app notifications are always recorded. Email goes to a demo sink, never to real recipients; each message retries three times before appearing in the failure queue."
      />
      <Tabs defaultValue="failed" className="grid gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="failed">
            Failure queue{failed.data?.length ? ` (${failed.data.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="all">All deliveries</TabsTrigger>
          <TabsTrigger value="sink">Demo email sink</TabsTrigger>
        </TabsList>
        <TabsContent value="failed">
          <QueryView
            query={failed}
            label="failed deliveries"
            isEmpty={(list) => list.length === 0}
            empty="No failed deliveries."
          >
            {(list) => (
              <DeliveryTable
                deliveries={list}
                caption="Deliveries that failed after three attempts"
                retry
              />
            )}
          </QueryView>
        </TabsContent>
        <TabsContent value="all">
          <QueryView
            query={all}
            label="deliveries"
            isEmpty={(list) => list.length === 0}
            empty="No messages have been sent."
          >
            {(list) => (
              <DeliveryTable
                deliveries={list}
                caption="All email deliveries, newest first"
              />
            )}
          </QueryView>
        </TabsContent>
        <TabsContent value="sink">
          <QueryView
            query={sink}
            label="delivered messages"
            isEmpty={(list) => list.length === 0}
            empty="The demo sink is empty."
          >
            {(list) => (
              <ul className="grid gap-3">
                {list.map((message) => (
                  <li
                    key={message.id}
                    className="rounded-lg border bg-card p-4 text-sm"
                  >
                    <p className="font-medium">{message.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      To {message.to} · {formatDateTime(message.deliveredAt)}
                    </p>
                    <p className="mt-2 whitespace-pre-line">{message.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </TabsContent>
      </Tabs>
    </div>
  );
}
