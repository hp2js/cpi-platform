import { PageHeader } from '@/components/page-header';
import { EvidenceLookup } from '@/features/review/evidence-lookup';

export function EvidencePage() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Oversight"
        title="Evidence"
        description="Files submitted by every institution. Filter by institution, quarter, category or review state; open a file or its submission."
      />
      <EvidenceLookup audience="supervisor" />
    </div>
  );
}
