import type { FoundationIndicator } from '@cpi/contracts';
import { FileText } from 'lucide-react';
import { formatBytes } from '@/features/reporting/answers';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';
import { FileViewer } from '@/features/files/file-viewer';

const statusLabel = {
  active: 'Active',
  superseded: 'Superseded',
  withdrawn: 'Withdrawn',
} as const;

/** Every recorded version, with its effective interval; supersession never deletes history. */
export function VersionList({ indicator }: { indicator: FoundationIndicator }) {
  return (
    <ol className="grid gap-2">
      {indicator.versions.map((version) => (
        <li
          key={version.id}
          className="grid gap-1 rounded-md border bg-background p-3 text-sm"
        >
          <p className="flex flex-wrap items-center gap-x-2">
            <FileText
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="font-medium">Version {version.version}:</span>
            <FileViewer file={version.evidence} />
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {statusLabel[version.status]}
            </span>
          </p>
          <p className="text-muted-foreground">
            Effective {formatCalendarDate(version.effectiveFrom)}
            {version.effectiveTo
              ? ` to ${formatCalendarDate(version.effectiveTo)}`
              : ''}{' '}
            · approval {version.approvalReference} · recorded{' '}
            {formatDateTime(version.recordedAt)} ·{' '}
            {formatBytes(version.evidence.sizeBytes)}
          </p>
          <p className="text-muted-foreground">
            Claims:{' '}
            {indicator.checks
              .filter((_, index) => version.claimedChecks[index])
              .join('; ') || 'none'}
          </p>
          {version.withdrawnReason && (
            <p>Withdrawn: {version.withdrawnReason}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
