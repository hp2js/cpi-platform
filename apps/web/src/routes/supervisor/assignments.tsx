import type { ReassignmentSuggestion } from '@cpi/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import {
  ListPager,
  ListSearch,
  useListControls,
} from '@/components/list-controls';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  assignmentsQuery,
  institutionsQuery,
} from '@/features/directory/queries';
import { assignmentHistoryQuery } from '@/features/simulation/queries';
import { AssignmentHistory } from '@/features/supervision/assignment-history';
import {
  suggestionsQuery,
  supervisionQuery,
} from '@/features/supervision/queries';
import { SuggestReassignment } from '@/features/supervision/suggest';
import { formatDateTime } from '@/lib/dates';

const statusLabel: Record<ReassignmentSuggestion['status'], string> = {
  open: 'Waiting for the administrator',
  applied: 'Applied',
  dismissed: 'Not applied',
};

function Current() {
  const institutions = useQuery(institutionsQuery);
  const assignments = useQuery(assignmentsQuery);
  const suggestions = useQuery(suggestionsQuery);
  const rows = (institutions.data ?? []).map((institution) => {
    const assignment = assignments.data?.find(
      (item) => item.institutionId === institution.id && !item.validTo,
    );
    const waiting = suggestions.data?.find(
      (item) => item.institutionId === institution.id && item.status === 'open',
    );
    return { institution, assignment, waiting };
  });
  const controls = useListControls(
    rows,
    (row) =>
      `${row.institution.id} ${row.institution.name} ${row.assignment?.officerName ?? ''}`,
  );
  return (
    <section aria-labelledby="current-heading" className="grid gap-3">
      <h2 id="current-heading" className="text-lg font-semibold">
        Your institutions and their officers
      </h2>
      <ListSearch
        controls={controls}
        label="Find an institution"
        placeholder="ID, name or officer"
      />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="min-w-[44rem]">
          <TableCaption className="sr-only">
            Institutions assigned to you and their reviewing officers
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Institution</TableHead>
              <TableHead scope="col">Reviewing officer</TableHead>
              <TableHead scope="col">Since</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {controls.visible.map(({ institution, assignment, waiting }) => (
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
                <TableCell>{assignment?.officerName ?? 'Unassigned'}</TableCell>
                <TableCell className="text-sm">
                  {assignment ? formatDateTime(assignment.validFrom) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <SuggestReassignment
                    institutionId={institution.id}
                    currentOfficerId={assignment?.officerId ?? null}
                    disabledReason={
                      waiting
                        ? 'Suggestion waiting for the administrator'
                        : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPager controls={controls} noun="institutions" />
    </section>
  );
}

function Suggestions({ list }: { list: ReassignmentSuggestion[] }) {
  return (
    <section aria-labelledby="suggestions-heading" className="grid gap-3">
      <h2 id="suggestions-heading" className="text-lg font-semibold">
        Reassignment requests
      </h2>
      <p className="text-sm text-muted-foreground">
        Your suggestions, and conflicts of interest declared by officers about
        your institutions. The administrator decides.
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None yet. Suggest a reassignment from the table above.
        </p>
      ) : (
        <ul className="grid gap-3">
          {list.map((suggestion) => (
            <li
              key={suggestion.id}
              className="grid gap-1.5 rounded-lg border bg-card p-4 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {suggestion.kind === 'conflict_of_interest'
                    ? `${suggestion.institutionId}: conflict of interest declared by ${suggestion.suggestedBy}`
                    : `${suggestion.institutionId}: ${suggestion.currentOfficerName ?? 'no officer'} → ${suggestion.suggestedOfficerName ?? 'the administrator’s choice'}`}
                </span>
                <Badge
                  variant={
                    suggestion.status === 'open' ? 'secondary' : 'outline'
                  }
                >
                  {statusLabel[suggestion.status]}
                </Badge>
              </div>
              <p>{suggestion.reason}</p>
              <p className="text-xs text-muted-foreground">
                Sent {formatDateTime(suggestion.at)}
                {suggestion.resolvedAt &&
                  ` · ${statusLabel[suggestion.status]} by ${suggestion.resolvedBy}, ${formatDateTime(suggestion.resolvedAt)}`}
              </p>
              {suggestion.resolutionNote && (
                <p className="rounded-md bg-muted p-2">
                  {suggestion.resolutionNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Read-only assignments for the supervisor's institutions, with suggestions to the administrator. */
export function SupervisorAssignmentsPage() {
  const suggestions = useQuery(suggestionsQuery);
  const history = useQuery(assignmentHistoryQuery);
  const supervision = useQuery(supervisionQuery);
  return (
    <div className="grid grid-cols-1 gap-8">
      <PageHeader
        eyebrow="Oversight"
        title="Assignments"
        description="Who reviews each of your institutions. Only the administrator changes assignments; you can suggest a change with a reason."
      />
      <Current />
      <QueryView query={suggestions} label="suggestions">
        {(list) => <Suggestions list={list} />}
      </QueryView>
      <Tabs defaultValue="officers" className="grid gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="officers">Officer history</TabsTrigger>
          <TabsTrigger value="supervisors">Supervisor history</TabsTrigger>
        </TabsList>
        <TabsContent value="officers">
          <QueryView query={history} label="assignment history">
            {(list) => (
              <AssignmentHistory
                list={list.map((row) => ({
                  ...row,
                  name: row.officerName,
                  reason: [
                    row.reason ?? 'Initial assignment',
                    row.cover &&
                      `Cover until ${formatDateTime(row.cover.until)}, then back to ${row.cover.returnToOfficerName}`,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }))}
                who="Officer"
                headingId="history-heading"
                title="Officer assignment history"
              />
            )}
          </QueryView>
        </TabsContent>
        <TabsContent value="supervisors">
          <QueryView query={supervision} label="supervisor history">
            {(list) => (
              <AssignmentHistory
                list={list.map((row) => ({ ...row, name: row.supervisorName }))}
                who="Supervisor"
                headingId="supervision-heading"
                title="Supervisor history"
              />
            )}
          </QueryView>
        </TabsContent>
      </Tabs>
    </div>
  );
}
