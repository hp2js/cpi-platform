import { PageHeader } from '@/components/page-header';
import { EvidenceLookup } from '@/features/review/evidence-lookup';

export function EvidencePage() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="My portfolio"
        title="Evidence"
        description="Files submitted by your assigned institutions. Filter by institution, quarter, category or review state; open a file or its submission."
      />
      <EvidenceLookup audience="officer" />
    </div>
  );
}
