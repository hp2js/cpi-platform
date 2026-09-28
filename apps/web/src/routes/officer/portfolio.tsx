import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { FinalizedComparison } from '@/features/oversight/comparison';
import { oversightQuery } from '@/features/oversight/queries';
import { Trends } from '@/features/oversight/trends';
import { formatDateTime } from '@/lib/dates';

/** The officer's own portfolio over the cycle (PRD §5.2: compare the assigned portfolio). */
export function PortfolioPage() {
  const oversight = useQuery(oversightQuery({}));
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Prevention officer"
        title="My portfolio"
        description="Reporting and review across your institutions this cycle, and your finalized results side by side."
      />
      <QueryView query={oversight} label="portfolio">
        {(data) => (
          <div className="grid gap-8">
            <p className="text-sm text-muted-foreground">
              As of {formatDateTime(data.asOf)} · {data.profileName}
              {data.simulation && ' (simulation profile)'}
            </p>
            <Trends data={data} />
            <FinalizedComparison data={data} />
          </div>
        )}
      </QueryView>
    </div>
  );
}
