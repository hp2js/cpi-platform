import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
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
import { cycleQuery } from '@/features/directory/queries';
import { statusLabel, weightSummary } from '@/features/settings/labels';
import { profilesQuery } from '@/features/settings/queries';
import { formatDateTime } from '@/lib/dates';

export function ProfilesPage() {
  const profiles = useQuery(profilesQuery);
  const cycle = useQuery(cycleQuery);
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Forms & scoring"
        title="Scoring profiles"
        description="A profile sets the indicator weights, the foundation checklists and the calculation for a whole cycle. It applies to the cycle rather than to a form version, and it locks when the cycle's first form version is published (PRD §7.1)."
      />
      <QueryView query={profiles} label="scoring profiles">
        {(data) => {
          const inUse = data.profiles.find(
            (profile) => profile.id === data.cycleProfileId,
          );
          return (
            <div className="grid grid-cols-1 gap-6">
              <section
                aria-labelledby="in-use-heading"
                className="rounded-lg border bg-white p-5"
              >
                <h2 id="in-use-heading" className="font-bold">
                  In use for {cycle.data?.label ?? 'this cycle'}
                </h2>
                <p className="mt-1">
                  {inUse ? (
                    <Link
                      to="/admin/profiles/$profileId"
                      params={{ profileId: inUse.id }}
                      className="font-bold text-primary underline-offset-4 hover:underline"
                    >
                      {inUse.name}
                    </Link>
                  ) : (
                    'No profile'
                  )}
                  {inUse && (
                    <span className="text-sm text-base-dark">
                      {' '}
                      · {weightSummary(inUse)}
                    </span>
                  )}
                </p>
                <p className="mt-2 flex items-start gap-2 text-sm text-base-dark">
                  {data.locked && (
                    <Lock className="mt-1 size-4 shrink-0" aria-hidden="true" />
                  )}
                  {data.lockedReason ??
                    'Not locked yet: an approved profile can still be applied before the first form version is published.'}
                </p>
              </section>

              <div className="overflow-x-auto rounded-lg border bg-white">
                <Table>
                  <TableCaption className="sr-only">
                    Scoring profiles
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Profile</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col">Weights</TableHead>
                      <TableHead scope="col">Approved</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.profiles.map((profile) => (
                      <TableRow key={profile.id}>
                        <TableHead scope="row" className="whitespace-normal">
                          <Link
                            to="/admin/profiles/$profileId"
                            params={{ profileId: profile.id }}
                            className="font-bold text-primary underline-offset-4 hover:underline"
                          >
                            {profile.name}
                          </Link>
                        </TableHead>
                        <TableCell>
                          <span className="flex flex-wrap gap-2">
                            <Badge variant="outline">
                              {statusLabel[profile.status]}
                            </Badge>
                            {profile.id === data.cycleProfileId && (
                              <Badge>In use</Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm whitespace-normal">
                          {weightSummary(profile)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {profile.approvedAt
                            ? `${formatDateTime(profile.approvedAt)} by ${profile.approvedBy}`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-sm text-base-dark">
                To make a new profile, open an existing one and copy it.
                Profiles are simulation settings: none is an official EACC
                scoring method.
              </p>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
