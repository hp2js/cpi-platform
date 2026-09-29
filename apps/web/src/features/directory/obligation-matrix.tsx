import type {
  Assignment,
  Cycle,
  Institution,
  Obligation,
} from '@cpi/contracts';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import {
  ListPager,
  ListSearch,
  useListControls,
} from '@/components/list-controls';
import { ObligationStatus } from '@/components/status';
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
  linkToInstitution,
}: {
  caption: string;
  cycle: Cycle;
  institutions: Institution[];
  obligations: Obligation[];
  assignments?: Assignment[];
  /** Where each institution's name leads: the officer's or the supervisor's institution page. */
  linkToInstitution?: 'officer' | 'supervisor';
}) {
  // Indexed once: a portfolio can hold hundreds of institutions.
  const byKey = useMemo(
    () =>
      new Map(
        obligations.map((obligation) => [
          `${obligation.institutionId}|${obligation.periodId}`,
          obligation,
        ]),
      ),
    [obligations],
  );
  const cell = (institutionId: string, periodId: string) =>
    byKey.get(`${institutionId}|${periodId}`);
  const officerOf = (institutionId: string) =>
    assignments?.find(
      (assignment) =>
        assignment.institutionId === institutionId && !assignment.validTo,
    )?.officerName ?? 'Unassigned';
  const controls = useListControls(
    institutions,
    (institution) =>
      `${institution.id} ${institution.name} ${assignments ? officerOf(institution.id) : ''}`,
  );
  return (
    <div className="grid gap-3">
      {institutions.length > controls.pageSize && (
        <ListSearch
          controls={controls}
          label="Find an institution"
          placeholder="ID or name"
        />
      )}
      <div className="overflow-x-auto rounded-lg border bg-white">
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
            {controls.visible.map((institution) => (
              <TableRow key={institution.id}>
                <TableHead
                  scope="row"
                  className="h-auto py-3 font-normal whitespace-normal"
                >
                  {linkToInstitution ? (
                    <Link
                      to={
                        linkToInstitution === 'officer'
                          ? '/officer/institutions/$institutionId'
                          : '/supervisor/institutions/$institutionId'
                      }
                      params={{ institutionId: institution.id }}
                      className="block font-bold text-primary underline-offset-4 hover:underline"
                    >
                      {institution.id}
                    </Link>
                  ) : (
                    <span className="block font-bold text-ink">
                      {institution.id}
                    </span>
                  )}
                  <span className="block text-xs text-base-dark">
                    {institution.name}
                  </span>
                </TableHead>
                {assignments && (
                  <TableCell className="text-sm">
                    {officerOf(institution.id)}
                  </TableCell>
                )}
                {cycle.periods.map((period) => {
                  const obligation = cell(institution.id, period.id);
                  return (
                    <TableCell key={period.id} className="align-top">
                      {obligation ? (
                        <span className="flex flex-col items-start gap-2">
                          <ObligationStatus
                            state={obligation.state}
                            flags={obligation.flags}
                          />
                        </span>
                      ) : (
                        <span className="text-xs text-base-dark">
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
      <ListPager controls={controls} noun="institutions" />
    </div>
  );
}
