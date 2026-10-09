import type { PlanningWorkItem } from '@cpi/contracts';
import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/dates';

const tabLabels: Record<PlanningWorkItem['tab'], string> = {
  baselines: 'Baselines',
  amendments: 'Amendments',
  foundations: 'Foundations',
};

/**
 * Plan work waiting on officers (HP2-52), most urgent first as the API orders it. An urgent
 * item says why in words, with an icon, never by colour alone. Officers go to the tab where
 * the work is done; supervisors read the institution page.
 */
export function PlanningWorkList({
  items,
  audience,
  caption,
}: {
  items: PlanningWorkItem[];
  audience: 'officer' | 'supervisor';
  caption: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <Table className="min-w-[40rem]">
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Institution</TableHead>
            <TableHead scope="col">Waiting on the officer</TableHead>
            {audience === 'supervisor' && (
              <TableHead scope="col">Officer</TableHead>
            )}
            <TableHead scope="col">Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableHead scope="row" className="font-normal whitespace-normal">
                {audience === 'officer' ? (
                  <Link
                    to="/officer/institutions/$institutionId"
                    params={{ institutionId: item.institutionId }}
                    search={{ tab: item.tab }}
                    className="usa-link font-bold"
                  >
                    {item.institutionId}
                    <span className="sr-only">
                      {' '}
                      {tabLabels[item.tab]}: {item.title}
                    </span>
                  </Link>
                ) : (
                  <Link
                    to="/supervisor/institutions/$institutionId"
                    params={{ institutionId: item.institutionId }}
                    className="usa-link font-bold"
                  >
                    {item.institutionId}
                  </Link>
                )}
                <span className="block text-xs text-base-dark">
                  {item.institutionName}
                </span>
              </TableHead>
              <TableCell className="whitespace-normal">
                {item.title}
                {item.flag && (
                  <span className="mt-1 flex items-start gap-1 text-sm font-bold text-error-dark">
                    <TriangleAlert
                      className="mt-1 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="sr-only">Urgent: </span>
                      {item.flag}
                    </span>
                  </span>
                )}
              </TableCell>
              {audience === 'supervisor' && (
                <TableCell className="whitespace-normal">
                  {item.officerName ?? 'No officer assigned'}
                </TableCell>
              )}
              <TableCell className="text-sm">
                {item.dueAt ? formatDateTime(item.dueAt) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
