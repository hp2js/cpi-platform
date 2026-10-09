import { PageHeader } from '@/components/page-header';
import { EvidenceLookup } from '@/features/review/evidence-lookup';

export function EvidencePage() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Prevention officer"
        title="Evidence"
        description="Files submitted with your assigned institutions' quarterly reports. Filter by institution, quarter, category or review state; open a file or its submission. Foundation documents (procedures, risk assessment, mitigation plan) are on each institution's Foundations tab."
      />
      <EvidenceLookup audience="officer" />
    </div>
  );
}
