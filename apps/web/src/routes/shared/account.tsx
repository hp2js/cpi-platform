import type { Account } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/features/settings/institution-form';
import { accountQuery, saveAccount } from '@/features/settings/queries';
import { sessionQuery } from '@/features/session/queries';
import { isApiError } from '@/lib/api';

const roleLabel: Record<Account['role'], string> = {
  institution: 'Institution focal person',
  officer: 'Prevention officer',
  supervisor: 'Supervisor',
  administrator: 'Administrator',
};

function Profile({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const id = useId();
  const initial = {
    displayName: account.displayName,
    jobTitle: account.jobTitle,
    phone: account.phone,
  };
  const [values, setValues] = useState(initial);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const save = useMutation({
    mutationFn: () => saveAccount(values),
    onSuccess: async (next) => {
      queryClient.setQueryData(accountQuery.queryKey, next);
      // The name and title appear in the header and prefill submissions.
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
    },
  });
  const errors = isApiError(save.error) ? save.error.fieldErrors : {};
  return (
    <form
      aria-labelledby={`${id}-heading`}
      className="grid max-w-2xl gap-4 rounded-lg border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h2 id={`${id}-heading`} className="font-semibold">
        Your details
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id={`${id}-name`}
          label="Name"
          value={values.displayName}
          onChange={(displayName) => setValues({ ...values, displayName })}
          error={errors.displayName}
        />
        <TextField
          id={`${id}-title`}
          label="Job title"
          optional
          hint={
            account.role === 'institution'
              ? 'Prefilled as your role when you submit a report.'
              : undefined
          }
          value={values.jobTitle}
          onChange={(jobTitle) => setValues({ ...values, jobTitle })}
          error={errors.jobTitle}
        />
        <TextField
          id={`${id}-phone`}
          label="Phone"
          type="tel"
          optional
          value={values.phone}
          onChange={(phone) => setValues({ ...values, phone })}
          error={errors.phone}
        />
      </div>
      {save.isSuccess && !dirty && (
        <p role="status" className="text-sm font-medium">
          Your details are saved.
        </p>
      )}
      {save.isError && Object.keys(errors).length === 0 && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={
            !dirty || values.displayName.trim().length < 3 || save.isPending
          }
        >
          {save.isPending ? 'Saving…' : 'Save changes'}
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

function Access({ account }: { account: Account }) {
  const rows: [string, string][] = [
    ['Email (sign-in)', account.email],
    ['Role', roleLabel[account.role]],
  ];
  if (account.institution)
    rows.push([
      'Institution',
      `${account.institution.name} (${account.institution.id})`,
    ]);
  if (account.reviewingOfficer)
    rows.push(['Reviewing officer', account.reviewingOfficer]);
  if (account.portfolioSize !== null)
    rows.push(['Portfolio', `${account.portfolioSize} institutions`]);
  return (
    <section
      aria-labelledby="access-heading"
      className="grid max-w-2xl gap-3 rounded-lg border bg-card p-5"
    >
      <h2 id="access-heading" className="font-semibold">
        Sign-in and access
      </h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
        {rows.map(([term, detail]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-medium break-words">{detail}</dd>
          </div>
        ))}
      </dl>
      <Alert>
        <AlertDescription>
          Your email, role and institution are set by the administrator. In this
          demonstration there is no password; real sign-in replaces the account
          picker before any pilot.
        </AlertDescription>
      </Alert>
    </section>
  );
}

export function AccountPage() {
  const account = useQuery(accountQuery);
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="My account"
        description="Keep your name, job title and phone up to date. They appear to the people you work with."
      />
      <QueryView query={account} label="your account">
        {(data) => (
          <div className="grid gap-6">
            <Profile account={data} />
            <Access account={data} />
          </div>
        )}
      </QueryView>
    </div>
  );
}
