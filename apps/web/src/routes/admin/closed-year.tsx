import { getRouteApi, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { buttonVariants } from '@/components/ui/button';
import { ClosedYearResults } from '@/features/years/earlier-years';
import { closedResultsQuery } from '@/features/years/queries';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';

const route = getRouteApi('/authed/admin/financial-years/$yearId');

/** A closed financial year's published results, every version, exactly as released (HP2-100). */
export function ClosedYearPage() {
  const { yearId } = route.useParams();
  const results = useQuery(closedResultsQuery(yearId));
  const year = results.data?.year;
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Closed financial year"
        title={year ? `${year.label} results` : 'Closed year results'}
        description={
          year
            ? `${formatCalendarDate(year.startsOn)} to ${formatCalendarDate(year.endsOn)} · scoring profile ${year.profileName}${year.closedAt ? ` · closed ${formatDateTime(year.closedAt)} by ${year.closedBy}` : ''}. Read-only: a published result changes only through a correction.`
            : undefined
        }
        actions={
          <Link
            to="/admin/financial-years"
            className={buttonVariants({ variant: 'plain' })}
          >
            <ArrowLeft aria-hidden="true" />
            Financial years
          </Link>
        }
      />
      <QueryView query={results} label="closed year">
        {(data) => <ClosedYearResults data={data} />}
      </QueryView>
    </div>
  );
}
