import type {
  ManagedInstitution,
  ManagedUser,
  Role,
  UserCreate,
} from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { MailCheck, Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Combobox } from '@/components/combobox';
import {
  ListPager,
  ListSearch,
  useListControls,
} from '@/components/list-controls';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { SelectField } from '@/components/select-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { TextField } from '@/features/settings/institution-form';
import {
  changeUserRole,
  createUser,
  peopleQuery,
  resendInvitation,
  setUserActive,
  updateUser,
} from '@/features/settings/queries';
import { useSession } from '@/features/session/use-session';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';

export const roleLabel: Record<Role, string> = {
  institution: 'Institution focal person',
  officer: 'Prevention officer',
  supervisor: 'Supervisor',
  administrator: 'Administrator',
};

function StatusChange({ user }: { user: ManagedUser }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const next = !user.active;
  const mutation = useMutation({
    mutationFn: () => setUserActive(user.id, next, reason, confirmed),
    onSuccess: async () => {
      setOpen(false);
      setReason('');
      setConfirmed(false);
      await queryClient.invalidateQueries();
    },
  });
  // The server says when this is the institution's last active focal person.
  const lastFocal =
    isApiError(mutation.error) && mutation.error.code === 'last_focal_person';
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setConfirmed(false);
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {user.active ? 'Deactivate' : 'Reactivate'}
          <span className="sr-only"> {user.displayName}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {user.active ? 'Deactivate' : 'Reactivate'} {user.displayName}?
          </DialogTitle>
          <DialogDescription>
            {user.active
              ? 'Their session ends at once and they can no longer sign in. Everything they recorded stays in the history (AT22).'
              : 'They can sign in again with their earlier role and scope.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={`status-reason-${user.id}`}>Reason</Label>
          <Textarea
            id={`status-reason-${user.id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="text-sm text-base-dark">
            At least 10 characters; kept in the audit log.
          </p>
          {lastFocal ? (
            <div
              role="alert"
              className="grid gap-2 rounded-md border border-error-dark p-3 text-sm"
            >
              <p>{mutation.error?.message}</p>
              <div className="flex items-start gap-2">
                <Checkbox
                  id={`status-confirm-${user.id}`}
                  checked={confirmed}
                  onCheckedChange={(value) => setConfirmed(value === true)}
                  className="mt-1"
                />
                <Label
                  htmlFor={`status-confirm-${user.id}`}
                  className="font-normal"
                >
                  Deactivate anyway. I will add or invite another focal person.
                </Label>
              </div>
            </div>
          ) : (
            mutation.isError && (
              <p role="alert" className="text-sm text-error-dark">
                {mutation.error.message}
              </p>
            )
          )}
        </div>
        <DialogFooter>
          <Button variant="plain" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={user.active ? 'destructive' : 'default'}
            disabled={
              reason.trim().length < 10 ||
              (lastFocal && !confirmed) ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {user.active ? 'Deactivate' : 'Reactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Changes an account's role, keeping one identity and its history (for example an officer
 * promoted to supervisor). The server refuses while scope has not been handed over.
 */
function ChangeRole({
  user,
  institutions,
}: {
  user: ManagedUser;
  institutions: ManagedInstitution[];
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(user.role);
  const [institutionId, setInstitutionId] = useState(user.institutionId ?? '');
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      changeUserRole(user.id, {
        role,
        institutionId: role === 'institution' ? institutionId || null : null,
        reason,
      }),
    onSuccess: async () => {
      setOpen(false);
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
          setRole(user.role);
          setInstitutionId(user.institutionId ?? '');
          setReason('');
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Change role
          <span className="sr-only"> for {user.displayName}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change {user.displayName}’s role</DialogTitle>
          <DialogDescription>
            They keep one account and their history. Their current session ends,
            and the new permissions apply when they next sign in. Institutions
            they review or supervise must be handed over first.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-role`}>New role</Label>
            <SelectField
              id={`${id}-role`}
              value={role}
              onChange={(value) => setRole(value as Role)}
              options={(Object.keys(roleLabel) as Role[]).map((value) => ({
                value,
                label: roleLabel[value],
              }))}
            />
          </div>
          {role === 'institution' && (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-institution`}>Institution</Label>
              <Combobox
                id={`${id}-institution`}
                placeholder="Choose an institution"
                searchPlaceholder="Search institutions"
                value={institutionId}
                onChange={setInstitutionId}
                options={institutions.map((institution) => ({
                  value: institution.id,
                  label: institution.id,
                  description: institution.name,
                }))}
                invalid={Boolean(errors.institutionId)}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor={`${id}-reason`}>Reason</Label>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {mutation.isError && (
            <p role="alert" className="text-sm text-error-dark">
              {mutation.error.message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="plain" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              (role === user.role &&
                (role !== 'institution' ||
                  institutionId === (user.institutionId ?? ''))) ||
              (role === 'institution' && !institutionId) ||
              reason.trim().length < 10 ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            Change role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Name and job title; the email is the sign-in identity and the role sets the scope. */
function EditUser({ user }: { user: ManagedUser }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    displayName: user.displayName,
    jobTitle: user.jobTitle,
  });
  const mutation = useMutation({
    mutationFn: () => updateUser(user.id, values),
    onSuccess: async () => {
      setOpen(false);
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
          setValues({ displayName: user.displayName, jobTitle: user.jobTitle });
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Edit<span className="sr-only"> {user.displayName}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {user.displayName}</DialogTitle>
          <DialogDescription>
            {user.email} · {roleLabel[user.role]}. The email is the sign-in
            identity and cannot be changed here; people can also update their
            own name and title under My account.
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
            id={`${id}-title`}
            label="Job title"
            optional
            value={values.jobTitle}
            onChange={(jobTitle) => setValues({ ...values, jobTitle })}
            error={errors.jobTitle}
          />
          {mutation.isError && Object.keys(errors).length === 0 && (
            <p role="alert" className="text-sm text-error-dark">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="plain"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                values.displayName.trim().length < 3 || mutation.isPending
              }
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Account state as people see it: invited accounts have not set a password yet. */
export function UserStatus({
  user,
}: {
  user: Pick<ManagedUser, 'status' | 'invitationExpiresAt'>;
}) {
  if (user.status === 'invited') {
    const expired =
      user.invitationExpiresAt !== null &&
      Date.parse(user.invitationExpiresAt) < Date.now();
    return (
      <span className="grid max-w-40 justify-items-start gap-1">
        <Badge variant={expired ? 'destructive' : 'secondary'}>
          {expired ? 'Invitation expired' : 'Invited'}
        </Badge>
        {user.invitationExpiresAt && !expired && (
          <span className="text-xs whitespace-normal text-base-dark">
            Link expires {formatDateTime(user.invitationExpiresAt)}
          </span>
        )}
      </span>
    );
  }
  return (
    <Badge variant={user.status === 'active' ? 'outline' : 'secondary'}>
      {user.status === 'active' ? 'Active' : 'Deactivated'}
    </Badge>
  );
}

export function ResendInvitation({
  user,
  onSent,
}: {
  user: Pick<ManagedUser, 'id' | 'email' | 'displayName'>;
  onSent: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => resendInvitation(user.id),
    onSuccess: async () => {
      onSent(`A new invitation was emailed to ${user.email}.`);
      await queryClient.invalidateQueries();
    },
    onError: (error) => onSent(error.message),
  });
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? 'Sending…' : 'Resend invitation'}
      <span className="sr-only"> to {user.displayName}</span>
    </Button>
  );
}

/** Where emailed links can be read in the demonstration. */
export function InvitationNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <Alert role="status">
      <MailCheck aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {message} In this demonstration, emails land in the{' '}
          <Link
            to="/admin/notifications"
            search={{ tab: 'sink' }}
            className="text-primary underline underline-offset-4"
          >
            demo email sink
          </Link>
          .
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function AddUser({
  institutions,
  onInvited,
}: {
  institutions: ManagedInstitution[];
  onInvited: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const blank: UserCreate = {
    displayName: '',
    email: '',
    jobTitle: '',
    role: 'institution',
    institutionId: null,
  };
  const [values, setValues] = useState<UserCreate>(blank);
  const mutation = useMutation({
    mutationFn: () => createUser(values),
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
        <Button>
          <Plus aria-hidden="true" />
          Add user
        </Button>
      </DialogTrigger>
      <DialogContent className="tablet:max-w-tablet">
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            They receive an email invitation to set their own password; no one
            else ever sees it. Demo accounts only: use a fictional
            @example.invalid address. New officers get institutions through{' '}
            <Link to="/admin/assignments" className="text-primary underline">
              Assignments
            </Link>
            .
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div data-columns className="grid gap-3 tablet:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor={`${id}-role`}>Role</Label>
              <SelectField
                id={`${id}-role`}
                value={values.role}
                onChange={(role) =>
                  setValues({
                    ...values,
                    role: role as Role,
                    institutionId:
                      role === 'institution' ? values.institutionId : null,
                  })
                }
                options={(Object.keys(roleLabel) as Role[]).map((role) => ({
                  value: role,
                  label: roleLabel[role],
                }))}
              />
            </div>
            {values.role === 'institution' && (
              <div className="grid content-start gap-2">
                <Label htmlFor={`${id}-institution`}>Institution</Label>
                <Combobox
                  id={`${id}-institution`}
                  placeholder="Choose an institution"
                  searchPlaceholder="Search institutions"
                  value={values.institutionId ?? ''}
                  onChange={(institutionId) =>
                    setValues({ ...values, institutionId })
                  }
                  options={institutions.map((institution) => ({
                    value: institution.id,
                    label: institution.id,
                    description: institution.name,
                  }))}
                  invalid={Boolean(errors.institutionId)}
                />
                {errors.institutionId && (
                  <p className="text-sm text-error-dark">
                    {errors.institutionId}
                  </p>
                )}
              </div>
            )}
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
          </div>
          {mutation.isError && Object.keys(errors).length === 0 && (
            <p role="alert" className="text-sm text-error-dark">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="plain"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                values.displayName.trim().length < 3 ||
                !values.email.trim() ||
                (values.role === 'institution' && !values.institutionId) ||
                mutation.isPending
              }
            >
              Add user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function scope(
  user: ManagedUser,
  institutions: Map<string, ManagedInstitution>,
) {
  if (user.role === 'institution') {
    const institution = institutions.get(user.institutionId ?? '');
    return institution ? (
      <Link
        to="/admin/institutions/$institutionId"
        params={{ institutionId: institution.id }}
        className="text-primary underline-offset-4 hover:underline"
      >
        {institution.id} {institution.name}
      </Link>
    ) : (
      user.institutionId
    );
  }
  if (user.role === 'officer' || user.role === 'supervisor') {
    const ids = user.assignedInstitutionIds;
    if (!ids.length)
      return user.role === 'supervisor'
        ? 'No institutions supervised'
        : 'No institutions assigned';
    return ids.length <= 4
      ? ids.join(', ')
      : `${ids.length} institutions (${ids.slice(0, 3).join(', ')}, …)`;
  }
  return 'All institutions';
}

function UsersTable({
  users,
  institutions,
  selfId,
  onNotice,
}: {
  users: ManagedUser[];
  institutions: ManagedInstitution[];
  selfId: string;
  onNotice: (message: string) => void;
}) {
  const [role, setRole] = useState('');
  const byId = useMemo(
    () =>
      new Map(institutions.map((institution) => [institution.id, institution])),
    [institutions],
  );
  const filtered = useMemo(
    () => (role ? users.filter((user) => user.role === role) : users),
    [users, role],
  );
  const controls = useListControls(
    filtered,
    (user) =>
      `${user.displayName} ${user.email} ${user.jobTitle} ${user.institutionId ?? ''} ${byId.get(user.institutionId ?? '')?.name ?? ''} ${user.status}`,
  );
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <ListSearch
          controls={controls}
          label="Find a user"
          placeholder="Name, email, title or institution"
        />
        <div className="grid w-56 gap-2">
          <Label htmlFor="user-role-filter">Role</Label>
          <SelectField
            id="user-role-filter"
            value={role}
            onChange={setRole}
            options={[
              { value: '', label: `All roles (${users.length})` },
              ...(Object.keys(roleLabel) as Role[]).map((value) => ({
                value,
                label: `${roleLabel[value]} (${users.filter((user) => user.role === value).length})`,
              })),
            ]}
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table>
          <TableCaption className="sr-only">Users</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col">Role</TableHead>
              <TableHead scope="col">Scope</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {controls.visible.map((user) => (
              <TableRow key={user.id}>
                <TableHead scope="row" className="whitespace-normal">
                  <span className="block font-bold">{user.displayName}</span>
                  <span className="block text-xs font-normal text-base-dark">
                    {user.email}
                    {user.jobTitle && ` · ${user.jobTitle}`}
                  </span>
                </TableHead>
                <TableCell>{roleLabel[user.role]}</TableCell>
                <TableCell className="text-sm whitespace-normal">
                  {scope(user, byId)}
                </TableCell>
                <TableCell>
                  <UserStatus user={user} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    {user.status === 'invited' && (
                      <ResendInvitation user={user} onSent={onNotice} />
                    )}
                    <EditUser user={user} />
                    {user.id === selfId ? (
                      <span className="self-center text-sm text-base-dark">
                        You
                      </span>
                    ) : (
                      <>
                        {user.active && (
                          <ChangeRole user={user} institutions={institutions} />
                        )}
                        <StatusChange user={user} />
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPager controls={controls} noun="users" />
    </div>
  );
}

export function UsersPage() {
  const session = useSession();
  const people = useQuery(peopleQuery);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Setup"
        title="Users"
        description="Platform accounts, their role and scope (FR01). Deactivating an account ends its session at once and keeps everything it recorded. Accounting Officers are institution contacts, not accounts; manage them on each institution’s page."
        actions={
          people.data && (
            <AddUser
              institutions={people.data.institutions}
              onInvited={setNotice}
            />
          )
        }
      />
      {notice && (
        <InvitationNotice message={notice} onDismiss={() => setNotice(null)} />
      )}
      <QueryView query={people} label="users">
        {(data) => (
          <UsersTable
            users={data.users}
            institutions={data.institutions}
            selfId={session.user.id}
            onNotice={setNotice}
          />
        )}
      </QueryView>
    </div>
  );
}
