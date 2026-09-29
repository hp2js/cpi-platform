import { evidenceLookupSchema } from '@cpi/contracts';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { QueryView } from '@/components/query-view';
import { Combobox } from '@/components/combobox';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/select-field';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cycleQuery, institutionsQuery } from '@/features/directory/queries';
import { evidenceCategoryLabel } from '@/features/reporting/answers';
import { EvidenceLink } from '@/features/reporting/evidence-link';
import { request } from '@/lib/api';

interface Filters {
  institutionId: string;
  periodId: string;
  category: string;
  reviewState: string;
}

const evidenceQuery = (filters: Filters) =>
  queryOptions({
    queryKey: ['evidence', filters],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value),
      );
      return request(`/api/evidence?${params}`, evidenceLookupSchema, {
        signal,
      });
    },
  });

const suitabilityLabel = {
  not_checked: 'Not checked',
  suitable: 'Suitable',
  deficient: 'Deficient',
} as const;

/**
 * Basic evidence lookup (FR15). Results come from the server already limited to the caller's
 * institutions; there is no free-text search across all documents.
 */
export function EvidenceLookup({
  audience,
}: {
  audience: 'officer' | 'supervisor';
}) {
  const [filters, setFilters] = useState<Filters>({
    institutionId: '',
    periodId: '',
    category: '',
    reviewState: '',
  });
  const institutions = useQuery(institutionsQuery);
  const cycle = useQuery(cycleQuery);
  const evidence = useQuery(evidenceQuery(filters));
  const set = (key: keyof Filters) => (value: string) =>
    setFilters({ ...filters, [key]: value });
  const select = (
    key: keyof Filters,
    label: string,
    options: [string, string][],
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`filter-${key}`}>{label}</Label>
      <SelectField
        id={`filter-${key}`}
        value={filters[key]}
        onChange={set(key)}
        options={[
          { value: '', label: 'All' },
          ...options.map(([value, text]) => ({ value, label: text })),
        ]}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-3 rounded-lg border bg-white p-4 tablet:grid-cols-2 desktop:grid-cols-4">
        <div className="grid gap-2">
          <Label htmlFor="filter-institutionId">Institution</Label>
          <Combobox
            id="filter-institutionId"
            allOption="All institutions"
            searchPlaceholder="Search institutions"
            value={filters.institutionId}
            onChange={set('institutionId')}
            options={(institutions.data ?? []).map((item) => ({
              value: item.id,
              label: item.id,
              description: item.name,
            }))}
          />
        </div>
        {select(
          'periodId',
          'Quarter',
          (cycle.data?.periods ?? []).map((period) => [
            period.id,
            period.label,
          ]),
        )}
        {select('category', 'Category', Object.entries(evidenceCategoryLabel))}
        {select('reviewState', 'Review state', [
          ['awaiting_review', 'Awaiting review'],
          ['finalized', 'Finalized'],
        ])}
      </div>
      <QueryView
        query={evidence}
        label="evidence"
        isEmpty={(list) => list.length === 0}
        empty="No submitted files match these filters."
      >
        {(list) => (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <Table className="min-w-[52rem]">
              <TableCaption className="sr-only">
                Submitted evidence, {list.length}{' '}
                {list.length === 1 ? 'file' : 'files'}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">File</TableHead>
                  <TableHead scope="col">Institution</TableHead>
                  <TableHead scope="col">Submission</TableHead>
                  <TableHead scope="col">Category</TableHead>
                  <TableHead scope="col">Cited by</TableHead>
                  <TableHead scope="col">Suitability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((row) => (
                  <TableRow key={`${row.submissionId}-${row.evidence.id}`}>
                    <TableHead scope="row" className="font-normal">
                      <EvidenceLink
                        evidenceId={row.evidence.id}
                        fileName={row.evidence.fileName}
                      />
                      {row.evidence.version > 1 && (
                        <span className="block text-xs text-base-dark">
                          Version {row.evidence.version}
                        </span>
                      )}
                    </TableHead>
                    <TableCell className="whitespace-normal">
                      <span className="block font-bold">
                        {row.institutionId}
                      </span>
                      <span className="block text-xs text-base-dark">
                        {row.institutionName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={
                          audience === 'officer'
                            ? '/officer/reviews/$submissionId'
                            : '/supervisor/reviews/$submissionId'
                        }
                        params={{ submissionId: row.submissionId }}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {row.periodLabel} · revision {row.revision}
                      </Link>
                      <span className="block text-xs text-base-dark">
                        {row.reviewState === 'finalized'
                          ? 'Finalized'
                          : 'Awaiting review'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {evidenceCategoryLabel[row.evidence.category]}
                    </TableCell>
                    <TableCell>{row.citedBy.join(', ') || '—'}</TableCell>
                    <TableCell>{suitabilityLabel[row.suitability]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryView>
    </div>
  );
}
