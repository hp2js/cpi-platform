import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { QueueStatus } from '@/features/review/queries';
import { ReviewQueueTable } from '@/features/review/queue-table';

/**
 * Every current submission, read only (PRD §5.2: the supervisor reads submitted evidence for
 * all institutions and can leave oversight comments, but does not decide or finalize).
 */
export function SubmissionsPage() {
  const [status, setStatus] = useState<QueueStatus>('open');
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Oversight"
        title="Submissions"
        description="Every institution's current revision, oldest first. Open one to read the claims, evidence and decisions, or to leave an oversight comment for the officer."
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
          <ReviewQueueTable status="open" audience="supervisor" />
        </TabsContent>
        <TabsContent value="finalized">
          <ReviewQueueTable status="finalized" audience="supervisor" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
