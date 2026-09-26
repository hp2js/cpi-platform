import type {
  Assignment,
  Cycle,
  Institution,
  Obligation,
} from '@cpi/contracts';
import { FlagList, WorkflowStateBadge } from '@/components/status';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Institution × quarter grid. Each cell states the workflow state and its flags in text, so
 * the table reads the same without colour (PRD §11, FR12).
 */
export function ObligationMatrix({
  caption,
  cycle,
  institutions,
  obligations,
  assignments,
}: {
  caption: string;
  cycle: Cycle;
  institutions: Institution[];
  obligations: Obligation[];
  assignments?: Assignment[];
}) {
  const cell = (institutionId: string, periodId: string) =>
    obligations.find(
      (obligation) =>
        obligation.institutionId === institutionId &&
        obligation.periodId === periodId,
    );
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table className="min-w-[56rem]">
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="w-64">
              Institution
            </TableHead>
            {assignments && <TableHead scope="col">Officer</TableHead>}
            {cycle.periods.map((period) => (
              <TableHead key={period.id} scope="col">
                {period.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {institutions.map((institution) => (
            <TableRow key={institution.id}>
              <TableHead
                scope="row"
                className="h-auto py-3 font-normal whitespace-normal"
              >
                <span className="block font-medium text-foreground">
                  {institution.id}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {institution.name}
                </span>
              </TableHead>
              {assignments && (
                <TableCell className="text-sm">
                  {assignments.find(
                    (assignment) =>
                      assignment.institutionId === institution.id &&
                      !assignment.validTo,
                  )?.officerName ?? 'Unassigned'}
                </TableCell>
              )}
              {cycle.periods.map((period) => {
                const obligation = cell(institution.id, period.id);
                return (
                  <TableCell key={period.id} className="align-top">
                    {obligation ? (
                      <span className="flex flex-col items-start gap-1.5">
                        <WorkflowStateBadge state={obligation.state} />
                        <FlagList flags={obligation.flags} />
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No obligation
                      </span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
