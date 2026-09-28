import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { QueueStatus } from '@/features/review/queries';
import { ReviewQueueTable } from '@/features/review/queue-table';

/** Read-only access to every review; acting on one needs a justified override (FR10). */
export function AdminReviewsPage() {
  const [status, setStatus] = useState<QueueStatus>('open');
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Operations"
        title="Reviews"
        description="Every institution's current submission. Reviews belong to the assigned officer; an administrator can act on one only through a logged override with a justification."
      />
      <Tabs
        value={status}
        onValueChange={(value) => setStatus(value as QueueStatus)}
        className="grid grid-cols-1 gap-4"
      >
        <TabsList>
          <TabsTrigger value="open">Awaiting review</TabsTrigger>
          <TabsTrigger value="finalized">Finalized</TabsTrigger>
        </TabsList>
        <TabsContent value="open">
          <ReviewQueueTable status="open" audience="administrator" />
        </TabsContent>
        <TabsContent value="finalized">
          <ReviewQueueTable status="finalized" audience="administrator" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
