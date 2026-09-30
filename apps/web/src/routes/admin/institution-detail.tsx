import type {
  AccountingOfficer,
  InstitutionType,
  ManagedInstitution,
} from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { ObligationStatus } from '@/components/status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cycleQuery, obligationsQuery } from '@/features/directory/queries';
import {
  AccountingOfficerFields,
  emptyAccountingOfficer,
  InstitutionTypeSelect,
  TextField,
} from '@/features/settings/institution-form';
import {
  createUser,
  peopleQuery,
  updateInstitution,
} from '@/features/settings/queries';
import { SupportView } from '@/features/support/support-view';
import { isApiError } from '@/lib/api';
import {
  InvitationNotice,
  ResendInvitation,
  UserStatus,
} from '@/routes/admin/users';

const route = getRouteApi('/authed/admin/institutions/$institutionId');

/** A card that shows values and switches to an in-place form with its own Save. */
function EditableCard({
  title,
  description,
  editing,
  onEdit,
  children,
}: {
  title: string;
  description?: string;
  editing: boolean;
  onEdit: () => void;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-4 rounded-lg border bg-white p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-bold">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-base-dark">{description}</p>
          )}
        </div>
        {!editing && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" />
            Edit<span className="sr-only"> {title.toLowerCase()}</span>
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm tablet:grid-cols-[12rem_1fr]">
      {rows.map(([term, detail]) => (
        <div key={term} className="contents">
          <dt className="text-base-dark">{term}</dt>
          <dd className="font-bold break-words">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

function useSave(institution: ManagedInstitution, onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: {
      name?: string;
      typeId?: string;
      accountingOfficer?: AccountingOfficer;
    }) =>
      updateInstitution(institution.id, {
        name: patch.name ?? institution.name,
        typeId: patch.typeId ?? institution.typeId,
        accountingOfficer:
          patch.accountingOfficer ??
          institution.accountingOfficer ??
          emptyAccountingOfficer,
      }),
    onSuccess: async () => {
      onDone();
      await queryClient.invalidateQueries();
    },
  });
}

function FormActions({
  onCancel,
  pending,
  disabled,
}: {
  onCancel: () => void;
  pending: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Button type="submit" disabled={disabled || pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function DetailsCard({
  institution,
  types,
}: {
  institution: ManagedInstitution;
  types: InstitutionType[];
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({
    name: institution.name,
    typeId: institution.typeId,
  });
  const save = useSave(institution, () => setEditing(false));
  const errors = isApiError(save.error) ? save.error.fieldErrors : {};
  return (
    <EditableCard
      title="Details"
      description="The ID is permanent, so reports, receipts and results stay linked when the name or type changes."
      editing={editing}
      onEdit={() => {
        setValues({ name: institution.name, typeId: institution.typeId });
        save.reset();
        setEditing(true);
      }}
    >
      {editing ? (
        <form
          className="grid max-w-measure gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(values);
          }}
        >
          <TextField
            id={`${id}-name`}
            label="Name"
            value={values.name}
            onChange={(name) => setValues({ ...values, name })}
            error={errors.name}
          />
          <InstitutionTypeSelect
            id={`${id}-type`}
            value={values.typeId}
            onChange={(typeId) => setValues({ ...values, typeId })}
            types={types}
            error={errors.typeId}
          />
          {save.isError && Object.keys(errors).length === 0 && (
            <p role="alert" className="text-sm text-error-dark">
              {save.error.message}
            </p>
          )}
          <FormActions
            onCancel={() => setEditing(false)}
            pending={save.isPending}
            disabled={values.name.trim().length < 3}
          />
        </form>
      ) : (
        <Facts
          rows={[
            ['Institution ID', institution.id],
            ['Name', institution.name],
            [
              'Type',
              <Link
                key="type"
                to="/admin/institutions"
                search={{ tab: 'types' }}
                className="text-primary underline-offset-4 hover:underline"
              >
                {institution.type}
              </Link>,
            ],
            ['Status', institution.active ? 'Active' : 'Inactive'],
          ]}
        />
      )}
    </EditableCard>
  );
}

function AccountingOfficerCard({
  institution,
}: {
  institution: ManagedInstitution;
}) {
  const id = useId();
  const current = institution.accountingOfficer ?? emptyAccountingOfficer;
  const [editing, setEditing] = useState(!institution.accountingOfficer);
  const [values, setValues] = useState(current);
  const save = useSave(institution, () => setEditing(false));
  const errors = isApiError(save.error) ? save.error.fieldErrors : {};
  return (
    <EditableCard
      title="Accounting Officer"
      description="A contact, not a platform account. Chairs the CPC; approval of each report is recorded by reference when the focal person submits."
      editing={editing}
      onEdit={() => {
        setValues(current);
        save.reset();
        setEditing(true);
      }}
    >
      {editing ? (
        <form
          className="grid max-w-measure gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({ accountingOfficer: values });
          }}
        >
          <AccountingOfficerFields
            idPrefix={id}
            value={values}
            onChange={setValues}
            errors={errors}
          />
          {save.isError && Object.keys(errors).length === 0 && (
            <p role="alert" className="text-sm text-error-dark">
              {save.error.message}
            </p>
          )}
          <FormActions
            onCancel={() => setEditing(false)}
            pending={save.isPending}
            disabled={
              values.name.trim().length < 3 ||
              values.designation.trim().length < 2
            }
          />
        </form>
      ) : (
        <Facts
          rows={[
            ['Name', current.name],
            ['Designation', current.designation],
            ['Email', current.email || '—'],
            ['Phone', current.phone || '—'],
          ]}
        />
      )}
    </EditableCard>
  );
}

function AddFocalPerson({
  institution,
  onInvited,
}: {
  institution: ManagedInstitution;
  onInvited: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const blank = {
    displayName: '',
    email: '',
    jobTitle: 'Integrity Assurance Officer',
  };
  const [values, setValues] = useState(blank);
  const mutation = useMutation({
    mutationFn: () =>
      createUser({
        ...values,
        role: 'institution',
        institutionId: institution.id,
      }),
    onSuccess: async () => {
      setOpen(false);
      onInvited(
        `${values.displayName.trim()} was added and invited by email to set a password (the link lasts 7 days).`,
      );
      await queryClient.invalidateQueries();
    },
  });
  const errors = isApiError(mutation.error) ? mutation.error.fieldErrors : {};
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(blank);
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus aria-hidden="true" />
          Add focal person
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a focal person for {institution.id}</DialogTitle>
          <DialogDescription>
            A platform account that reports for {institution.name}. They get an
            email invitation to set their own password, then sign in with this
            email.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <TextField
            id={`${id}-name`}
            label="Name"
            value={values.displayName}
            onChange={(displayName) => setValues({ ...values, displayName })}
            error={errors.displayName}
          />
          <TextField
            id={`${id}-email`}
            label="Email (sign-in)"
            type="email"
            placeholder="name@example.invalid"
            value={values.email}
            onChange={(email) => setValues({ ...values, email })}
            error={errors.email}
          />
          <TextField
            id={`${id}-title`}
            label="Job title"
            optional
            value={values.jobTitle}
            onChange={(jobTitle) => setValues({ ...values, jobTitle })}
          />
          {mutation.isError && Object.keys(errors).length === 0 && (
            <p role="alert" className="text-sm text-error-dark">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                values.displayName.trim().length < 3 ||
                !values.email.trim() ||
                mutation.isPending
              }
            >
              Add focal person
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FocalPersonsCard({
  institution,
}: {
  institution: ManagedInstitution;
}) {
  const headingId = useId();
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-4 rounded-lg border bg-white p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-bold">
            Focal persons
          </h2>
          <p className="mt-1 text-sm text-base-dark">
            Platform accounts that report for the institution. Deactivate or
            rename them on the Users page.
          </p>
        </div>
        <AddFocalPerson institution={institution} onInvited={setNotice} />
      </div>
      {notice && (
        <InvitationNotice message={notice} onDismiss={() => setNotice(null)} />
      )}
      {institution.focalPersons.length === 0 ? (
        <Alert>
          <AlertTitle>No focal person</AlertTitle>
          <AlertDescription>
            Nobody can report for this institution until a focal person is
            added.
          </AlertDescription>
        </Alert>
      ) : (
        <ul className="grid gap-2">
          {!institution.focalPersons.some(
            (person) => person.status === 'active',
          ) && (
            <li>
              <Alert>
                <AlertTitle>No active focal person</AlertTitle>
                <AlertDescription>
                  Nobody can report for this institution or receive its
                  clarifications until someone below finishes setting up, or a
                  new focal person is added.
                </AlertDescription>
              </Alert>
            </li>
          )}
          {institution.focalPersons.map((person) => (
            <li
              key={person.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <span>
                <span className="block font-bold">{person.displayName}</span>
                <span className="block text-base-dark">
                  {person.email}
                  {person.jobTitle && ` · ${person.jobTitle}`}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <UserStatus user={person} />
                {person.status === 'invited' && (
                  <ResendInvitation user={person} onSent={setNotice} />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm">
        <Link to="/admin/users" className="text-primary underline">
          Manage accounts on the Users page
        </Link>
      </p>
    </section>
  );
}

function ReportingCard({ institution }: { institution: ManagedInstitution }) {
  const cycle = useQuery(cycleQuery);
  const obligations = useQuery(obligationsQuery(institution.id));
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-3 rounded-lg border bg-white p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-bold">
            Reporting and review
          </h2>
          <p className="mt-1 text-sm text-base-dark">
            Reviewed by {institution.officer?.name ?? 'nobody (unassigned)'};
            supervised by{' '}
            {institution.supervisor?.name ??
              'nobody, so no supervisor can see it'}
            .
          </p>
        </div>
        <Link
          to="/admin/assignments"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Change officer or supervisor
        </Link>
      </div>
      <ul className="grid gap-2 tablet:grid-cols-2">
        {cycle.data?.periods.map((period) => {
          const obligation = obligations.data?.find(
            (candidate) => candidate.periodId === period.id,
          );
          return (
            <li key={period.id} className="grid gap-2 rounded-md border p-3">
              <span className="text-sm font-bold">{period.label}</span>
              {obligation && (
                <span className="flex flex-wrap items-start gap-2">
                  <ObligationStatus
                    state={obligation.state}
                    flags={obligation.flags}
                  />
                </span>
              )}
              {obligation &&
                (obligation.state === 'draft' ||
                  obligation.state === 'clarification_requested') && (
                  <span>
                    <SupportView
                      obligationId={obligation.id}
                      periodLabel={period.label}
                    />
                  </span>
                )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function InstitutionDetailPage() {
  const { institutionId } = route.useParams();
  const people = useQuery(peopleQuery);
  const institution = people.data?.institutions.find(
    (candidate) => candidate.id === institutionId,
  );
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow={
          institution
            ? `${institution.id} · ${institution.type}`
            : 'Institution'
        }
        title={institution?.name ?? 'Institution'}
        actions={
          <Link
            to="/admin/institutions"
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft aria-hidden="true" />
            All institutions
          </Link>
        }
      />
      <QueryView query={people} label="institution">
        {(data) =>
          institution ? (
            <div className="grid grid-cols-1 gap-6 widescreen:grid-cols-2">
              <DetailsCard
                key={`details-${institution.name}-${institution.typeId}`}
                institution={institution}
                types={data.institutionTypes}
              />
              <AccountingOfficerCard
                key={`ao-${JSON.stringify(institution.accountingOfficer)}`}
                institution={institution}
              />
              <FocalPersonsCard institution={institution} />
              <ReportingCard institution={institution} />
            </div>
          ) : (
            <p className="text-base-dark">
              No institution has the ID {institutionId}.{' '}
              <Link to="/admin/institutions" className="text-primary underline">
                See all institutions
              </Link>
              .
            </p>
          )
        }
      </QueryView>
    </div>
  );
}
