import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { buttonVariants } from '@/components/ui/button';
import { ClarificationCard } from '@/features/clarifications/clarification-card';
import { cycleQuery } from '@/features/directory/queries';
import { obligationIdFor, reportQuery } from '@/features/reporting/queries';
import { useSession } from '@/features/session/use-session';

export function ClarificationsPage() {
  const session = useSession();
  const cycle = useQuery(cycleQuery);
  const periods = cycle.data?.periods ?? [];
  const reports = useQueries({
    queries: periods.map((period) =>
      reportQuery(obligationIdFor(session.user.institutionId ?? '', period.id)),
    ),
  });
  const clarifications = reports
    .flatMap((report) => report.data?.clarifications ?? [])
    .sort(
      (a, b) =>
        Number(b.status === 'open') - Number(a.status === 'open') ||
        Date.parse(b.requestedAt) - Date.parse(a.requestedAt),
    );
  const loading = cycle.isPending || reports.some((report) => report.isPending);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Clarification requests"
        description="Questions from your reviewing officer. Respond by submitting a revised report; your earlier receipts are kept."
      />
      <QueryView query={cycle} label="clarification requests">
        {() =>
          loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading clarification requests…
            </p>
          ) : clarifications.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              There are no clarification requests.
            </p>
          ) : (
            <div className="grid gap-4">
              {clarifications.map((clarification) => (
                <ClarificationCard
                  key={clarification.id}
                  clarification={clarification}
                  audience="institution"
                  actions={
                    clarification.status === 'open' && (
                      <div>
                        <Link
                          to="/institution/reports/$periodId"
                          params={{ periodId: clarification.periodId }}
                          className={buttonVariants()}
                        >
                          Prepare a revised report
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </div>
                    )
                  }
                />
              ))}
            </div>
          )
        }
      </QueryView>
    </div>
  );
}
