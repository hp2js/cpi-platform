import type { Obligation, ObligationFlag } from '@cpi/contracts';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import {
  ListPager,
  ListSearch,
  useListControls,
} from '@/components/list-controls';
import { FlagList, WorkflowStateBadge, flagLabel } from '@/components/status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  assignmentsQuery,
  cycleQuery,
  institutionQuery,
  institutionsQuery,
  obligationsQuery,
} from '@/features/directory/queries';
import { oversightQuery } from '@/features/oversight/queries';
import { Trends } from '@/features/oversight/trends';
import { planQuery } from '@/features/planning/queries';
import { reviewQueueQuery } from '@/features/review/queries';
import {
  suggestionsQuery,
  supervisionQuery,
} from '@/features/supervision/queries';
import { SuggestReassignment } from '@/features/supervision/suggest';

/** Flags a supervisor acts on; `not_yet_due` is context, not attention. */
const attention: ObligationFlag[] = [
  'late',
  'review_overdue',
  'clarification_overdue',
  'needs_re_review',
  'evidence_incomplete',
];

function attentionFlags(obligations: Obligation[]) {
  const counts = new Map<ObligationFlag, number>();
  for (const obligation of obligations)
    for (const flag of obligation.flags)
      if (attention.includes(flag))
        counts.set(flag, (counts.get(flag) ?? 0) + 1);
  return [...counts.entries()];
}

export function SupervisorInstitutionsPage() {
  const institutions = useQuery(institutionsQuery);
  const obligations = useQuery(obligationsQuery());
  const assignments = useQuery(assignmentsQuery);
  const rows = (institutions.data ?? []).map((institution) => ({
    institution,
    officer:
      assignments.data?.find(
        (item) => item.institutionId === institution.id && !item.validTo,
      )?.officerName ?? 'Unassigned',
    flags: attentionFlags(
      (obligations.data ?? []).filter(
        (obligation) => obligation.institutionId === institution.id,
      ),
    ),
  }));
  const controls = useListControls(
    rows,
    (row) =>
      `${row.institution.id} ${row.institution.name} ${row.institution.type} ${row.officer}`,
  );
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Oversight"
        title="Institutions"
        description="The institutions assigned to you. Open one for its quarters, trend and plan."
      />
      <QueryView
        query={institutions}
        label="institutions"
        isEmpty={(list) => list.length === 0}
        empty="No institutions are assigned to you yet. The administrator assigns them."
      >
        {() => (
          <div className="grid gap-3">
            <ListSearch
              controls={controls}
              label="Find an institution"
              placeholder="ID, name, type or officer"
            />
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table className="min-w-[44rem]">
                <TableCaption className="sr-only">
                  Institutions assigned to you
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Institution</TableHead>
                    <TableHead scope="col">Type</TableHead>
                    <TableHead scope="col">Reviewing officer</TableHead>
                    <TableHead scope="col">Needs attention</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {controls.visible.map(({ institution, officer, flags }) => (
                    <TableRow key={institution.id}>
                      <TableHead scope="row" className="whitespace-normal">
                        <Link
                          to="/supervisor/institutions/$institutionId"
                          params={{ institutionId: institution.id }}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {institution.id}
                        </Link>
                        <span className="block text-xs font-normal text-muted-foreground">
                          {institution.name}
                        </span>
                      </TableHead>
                      <TableCell className="text-sm">
                        {institution.type}
                      </TableCell>
                      <TableCell>{officer}</TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        {institution.activeFocalPersons === 0 && (
                          <span className="block font-medium text-destructive">
                            No active focal person
                          </span>
                        )}
                        {flags.length === 0
                          ? institution.activeFocalPersons === 0
                            ? null
                            : 'Nothing'
                          : flags
                              .map(
                                ([flag, count]) =>
                                  `${flagLabel(flag)}: ${count}`,
                              )
                              .join(' · ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ListPager controls={controls} noun="institutions" />
          </div>
        )}
      </QueryView>
    </div>
  );
}

const route = getRouteApi('/authed/supervisor/institutions/$institutionId');

function Quarters({ institutionId }: { institutionId: string }) {
  const cycle = useQuery(cycleQuery);
  const obligations = useQuery(obligationsQuery(institutionId));
  const open = useQuery(reviewQueueQuery('open'));
  const finalized = useQuery(reviewQueueQuery('finalized'));
  const submissionFor = (obligationId: string) =>
    [...(open.data ?? []), ...(finalized.data ?? [])].find(
      (item) => item.obligationId === obligationId,
    );
  return (
    <section aria-labelledby="quarters-heading" className="grid gap-3">
      <h2 id="quarters-heading" className="text-lg font-semibold">
        Quarters
      </h2>
      <QueryView query={obligations} label="quarters">
        {(list) => (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table className="min-w-[40rem]">
              <TableCaption className="sr-only">
                Reporting status by quarter
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Quarter</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Days late</TableHead>
                  <TableHead scope="col">Submission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((obligation) => {
                  const period = cycle.data?.periods.find(
                    (candidate) => candidate.id === obligation.periodId,
                  );
                  const submission = submissionFor(obligation.id);
                  return (
                    <TableRow key={obligation.id}>
                      <TableHead scope="row">
                        {period?.label ?? obligation.periodId}
                      </TableHead>
                      <TableCell>
                        <span className="flex flex-col items-start gap-1.5">
                          <WorkflowStateBadge state={obligation.state} />
                          <FlagList flags={obligation.flags} />
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {obligation.daysLate === null
                          ? '—'
                          : obligation.daysLate}
                      </TableCell>
                      <TableCell>
                        {submission ? (
                          <Link
                            to="/supervisor/reviews/$submissionId"
                            params={{ submissionId: submission.submissionId }}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            Open revision {submission.revision}
                            <span className="sr-only">
                              {' '}
                              for {period?.label}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Not submitted
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryView>
    </section>
  );
}

function Baselines({ institutionId }: { institutionId: string }) {
  const plan = useQuery(planQuery(institutionId));
  return (
    <section aria-labelledby="baselines-heading" className="grid gap-3">
      <h2 id="baselines-heading" className="text-lg font-semibold">
        Quarterly baselines
      </h2>
      <QueryView query={plan} label="baselines">
        {(data) => {
          // The latest version per quarter.
          const latest = [
            ...new Map(
              [...data.baselines]
                .sort((a, b) => a.version - b.version)
                .map((baseline) => [baseline.periodId, baseline]),
            ).values(),
          ];
          return (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {latest.map((baseline) => (
                <li
                  key={baseline.id}
                  className="grid gap-1 rounded-lg border bg-card p-3 text-sm"
                >
                  <span className="font-medium">{baseline.periodLabel}</span>
                  <span>
                    <Badge
                      variant={
                        baseline.status === 'approved' ? 'outline' : 'secondary'
                      }
                    >
                      {baseline.status === 'approved'
                        ? 'Approved'
                        : baseline.status === 'returned'
                          ? 'Returned'
                          : 'Awaiting approval'}
                    </Badge>
                  </span>
                  <span className="text-muted-foreground">
                    {baseline.milestones.length} milestones · version{' '}
                    {baseline.version}
                  </span>
                </li>
              ))}
            </ul>
          );
        }}
      </QueryView>
    </section>
  );
}

/** One institution in the supervisor's scope, read only (PRD §5.2). */
export function SupervisorInstitutionPage() {
  const { institutionId } = route.useParams();
  const institution = useQuery(institutionQuery(institutionId));
  const assignments = useQuery(assignmentsQuery);
  const supervision = useQuery(supervisionQuery);
  const suggestions = useQuery(suggestionsQuery);
  const oversight = useQuery(oversightQuery({ institutionId }));
  const officer = assignments.data?.find(
    (item) => item.institutionId === institutionId && !item.validTo,
  );
  const supervisor = supervision.data?.find(
    (item) => item.institutionId === institutionId && !item.validTo,
  );
  const waiting = suggestions.data?.some(
    (item) => item.institutionId === institutionId && item.status === 'open',
  );
  return (
    <QueryView query={institution} label="institution">
      {(data) => (
        <div className="grid grid-cols-1 gap-8">
          <PageHeader
            eyebrow={
              <Link
                to="/supervisor/institutions"
                className="underline-offset-4 hover:underline"
              >
                Institutions
              </Link>
            }
            title={`${data.id} ${data.name}`}
            description={data.type}
            actions={
              <SuggestReassignment
                institutionId={data.id}
                currentOfficerId={officer?.officerId ?? null}
                disabledReason={
                  waiting
                    ? 'A reassignment suggestion is waiting for the administrator.'
                    : undefined
                }
              />
            }
          />
          {data.activeFocalPersons === 0 && (
            <Alert variant="destructive">
              <AlertTitle>No active focal person</AlertTitle>
              <AlertDescription>
                Nobody can report for {data.id} or receive its clarifications
                until the administrator sets someone up.
              </AlertDescription>
            </Alert>
          )}
          <dl className="grid gap-x-6 gap-y-2 rounded-lg border bg-card p-5 text-sm sm:grid-cols-[12rem_1fr]">
            {[
              ['Reviewing officer', officer?.officerName ?? 'Unassigned'],
              ['Supervisor', supervisor?.supervisorName ?? '—'],
              [
                'Accounting Officer',
                data.accountingOfficer
                  ? `${data.accountingOfficer.name}, ${data.accountingOfficer.designation}`
                  : 'Not recorded',
              ],
            ].map(([term, detail]) => (
              <div key={term} className="contents">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="font-medium">{detail}</dd>
              </div>
            ))}
          </dl>
          <Quarters institutionId={data.id} />
          <QueryView query={oversight} label="trend">
            {(trend) => (
              <Trends
                data={trend}
                headingId="institution-trend-heading"
                title="Trend for this institution"
              />
            )}
          </QueryView>
          <Baselines institutionId={data.id} />
        </div>
      )}
    </QueryView>
  );
}
