import type { AccountingOfficer, InstitutionProfile } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AccountingOfficerFields } from '@/features/settings/institution-form';
import {
  institutionProfileQuery,
  updateAccountingOfficer,
} from '@/features/institution/queries';
import { useSession } from '@/features/session/use-session';
import { isApiError } from '@/lib/api';

const statusLabel = {
  active: 'Active',
  invited: 'Invited, not set up yet',
  deactivated: 'Deactivated',
} as const;

function AccountingOfficerForm({ profile }: { profile: InstitutionProfile }) {
  const queryClient = useQueryClient();
  const initial: AccountingOfficer = profile.institution.accountingOfficer ?? {
    name: '',
    designation: '',
    email: '',
    phone: '',
  };
  const [values, setValues] = useState(initial);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const save = useMutation({
    mutationFn: () => updateAccountingOfficer(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
  const errors = isApiError(save.error) ? save.error.fieldErrors : {};
  return (
    <form
      className="grid max-w-measure gap-4 rounded-lg border bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <AccountingOfficerFields
        idPrefix="profile"
        value={values}
        onChange={setValues}
        errors={errors}
      />
      <p className="text-sm text-base-dark">
        Keep this current when your Accounting Officer changes. Your reviewing
        officer is told, and the change is recorded.
      </p>
      {save.isSuccess && !dirty && (
        <p role="status" className="text-sm font-bold">
          The Accounting Officer’s details are saved.
        </p>
      )}
      {save.isError && Object.keys(errors).length === 0 && (
        <p role="alert" className="text-sm text-error-dark">
          {save.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save Accounting Officer'}
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setValues(initial)}
          >
            Discard
          </Button>
        )}
      </div>
    </form>
  );
}

function Details({ profile }: { profile: InstitutionProfile }) {
  const session = useSession();
  const rows: [string, string][] = [
    ['Institution ID', profile.institution.id],
    ['Type', profile.institution.type],
    ['Reviewing officer', profile.reviewingOfficer ?? 'Not assigned yet'],
  ];
  return (
    <div className="grid gap-6">
      <section
        aria-labelledby="details-heading"
        className="grid max-w-measure gap-3 rounded-lg border bg-white p-5"
      >
        <h2 id="details-heading" className="font-bold">
          Details
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm tablet:grid-cols-[10rem_1fr]">
          {rows.map(([term, detail]) => (
            <div key={term} className="contents">
              <dt className="text-base-dark">{term}</dt>
              <dd className="font-bold">{detail}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-base-dark">
          The name, type and ID are managed by the administrator. Contact them
          if these are wrong.
        </p>
      </section>
      <section
        aria-labelledby="team-heading"
        className="grid max-w-measure gap-3 rounded-lg border bg-white p-5"
      >
        <h2 id="team-heading" className="font-bold">
          Focal persons
        </h2>
        <p className="text-sm text-base-dark">
          Everyone who reports for {profile.institution.name}. The administrator
          adds and removes focal persons.
        </p>
        <ul className="divide-y rounded-md border">
          {profile.focalPersons.map((person) => (
            <li
              key={person.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span>
                <span className="block font-bold">
                  {person.displayName}
                  {person.displayName === session.user.displayName && ' (you)'}
                </span>
                <span className="block text-base-dark">
                  {person.email}
                  {person.jobTitle && ` · ${person.jobTitle}`}
                </span>
              </span>
              <Badge
                variant={person.status === 'active' ? 'outline' : 'secondary'}
              >
                {statusLabel[person.status]}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** What a focal person sees and keeps current about their own institution. */
export function InstitutionProfilePage() {
  const profile = useQuery(institutionProfileQuery);
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Our institution"
        title={profile.data?.institution.name ?? 'Our institution'}
        description="Your institution’s record, the people who report for it, and its Accounting Officer."
      />
      <QueryView query={profile} label="your institution">
        {(data) => (
          <div className="grid gap-6">
            <Details profile={data} />
            <AccountingOfficerForm profile={data} />
          </div>
        )}
      </QueryView>
    </div>
  );
}
