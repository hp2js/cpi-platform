import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { auditQuery } from '@/features/events/queries';
import { roleLabel } from '@/features/session/queries';
import { formatDateTime } from '@/lib/dates';
import { SelectField } from '@/components/select-field';

const objectTypes = [
  'form',
  'submission',
  'decision',
  'clarification',
  'evidence',
  'baseline',
  'amendment',
  'foundation',
  'delivery',
];

export function AuditPage() {
  const [objectType, setObjectType] = useState<string | null>(null);
  const events = useQuery(auditQuery(objectType));
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Operations"
        title="Audit log"
        description="Every publish, submission, review decision, clarification, baseline and delivery action, with actor, object version and time. Entries cannot be edited here."
      />
      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="audit-type">Object type</Label>
        <SelectField
          id="audit-type"
          value={objectType ?? ''}
          onChange={(value) => setObjectType(value || null)}
          options={[
            { value: '', label: 'All' },
            ...objectTypes.map((type) => ({ value: type, label: type })),
          ]}
        />
      </div>
      <QueryView
        query={events}
        label="audit events"
        isEmpty={(list) => list.length === 0}
        empty="No events recorded yet."
      >
        {(list) => (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table className="min-w-[60rem]">
              <TableCaption className="sr-only">
                Audit events, newest first
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Business time</TableHead>
                  <TableHead scope="col">Actor</TableHead>
                  <TableHead scope="col">Action</TableHead>
                  <TableHead scope="col">Object</TableHead>
                  <TableHead scope="col">Summary</TableHead>
                  <TableHead scope="col">Actual time (UTC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDateTime(event.businessTime)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {event.actorName}
                      <span className="block text-xs text-muted-foreground">
                        {roleLabel[event.actorRole]}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.action}
                    </TableCell>
                    <TableCell className="text-sm">
                      {event.objectType} {event.objectId}
                      {event.objectVersion && (
                        <span className="block text-xs text-muted-foreground">
                          version {event.objectVersion}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {event.summary}
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {event.actualTime.slice(0, 19).replace('T', ' ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryView>
    </div>
  );
}
