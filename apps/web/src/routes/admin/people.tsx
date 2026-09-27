import type {
  InstitutionUpdate,
  ManagedInstitution,
  ManagedUser,
  Role,
  UserCreate,
} from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Combobox } from '@/components/combobox';
import {
  ListPager,
  ListSearch,
  useListControls,
} from '@/components/list-controls';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  createUser,
  peopleQuery,
  setUserActive,
  updateInstitution,
} from '@/features/settings/queries';
import {
  AddInstitution,
  ImportInstitutions,
} from '@/features/settings/onboarding';
import { useSession } from '@/features/session/use-session';
import { isApiError } from '@/lib/api';

const roleLabel: Record<Role, string> = {
  institution: 'Institution focal person',
  officer: 'Prevention officer',
  supervisor: 'Supervisor',
  administrator: 'Administrator',
};

function StatusChange({ user }: { user: ManagedUser }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const next = !user.active;
  const mutation = useMutation({
    mutationFn: () => setUserActive(user.id, next, reason),
    onSuccess: async () => {
      setOpen(false);
      setReason('');
      await queryClient.invalidateQueries();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        <div className="grid gap-1.5">
          <Label htmlFor={`status-reason-${user.id}`}>Reason</Label>
          <Textarea
            id={`status-reason-${user.id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            At least 10 characters; kept in the audit log.
          </p>
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={user.active ? 'destructive' : 'default'}
            disabled={reason.trim().length < 10 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {user.active ? 'Deactivate' : 'Reactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddUser({ institutions }: { institutions: ManagedInstitution[] }) {
  const queryClient = useQueryClient();
  const blank: UserCreate = {
    displayName: '',
    email: '',
    role: 'institution',
    institutionId: institutions[0]?.id ?? null,
  };
  const [values, setValues] = useState<UserCreate>(blank);
  const mutation = useMutation({
    mutationFn: () => createUser(values),
    onSuccess: async () => {
      setValues(blank);
      await queryClient.invalidateQueries();
    },
  });
  const errors = isApiError(mutation.error) ? mutation.error.fieldErrors : {};
  return (
    <form
      aria-labelledby="add-user-heading"
      className="grid max-w-3xl grid-cols-1 gap-3 rounded-lg border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <h3 id="add-user-heading" className="font-semibold">
        Add a user
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="new-user-name">Name</Label>
          <Input
            id="new-user-name"
            value={values.displayName}
            onChange={(event) =>
              setValues({ ...values, displayName: event.target.value })
            }
          />
          {errors.displayName && (
            <p className="text-sm text-destructive">{errors.displayName}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-user-email">Email</Label>
          <Input
            id="new-user-email"
            type="email"
            placeholder="name@example.invalid"
            value={values.email}
            onChange={(event) =>
              setValues({ ...values, email: event.target.value })
            }
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-user-role">Role</Label>
          <NativeSelect
            id="new-user-role"
            value={values.role}
            onChange={(event) => {
              const role = event.target.value as Role;
              setValues({
                ...values,
                role,
                institutionId:
                  role === 'institution' ? (institutions[0]?.id ?? null) : null,
              });
            }}
          >
            {(Object.keys(roleLabel) as Role[]).map((role) => (
              <option key={role} value={role}>
                {roleLabel[role]}
              </option>
            ))}
          </NativeSelect>
        </div>
        {values.role === 'institution' && (
          <div className="grid gap-1.5">
            <Label htmlFor="new-user-institution">Institution</Label>
            <Combobox
              id="new-user-institution"
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
            />
            {errors.institutionId && (
              <p className="text-sm text-destructive">{errors.institutionId}</p>
            )}
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Demo accounts only: use a fictional @example.invalid address. New
        officers get institutions through{' '}
        <Link to="/admin/assignments" className="text-primary underline">
          Assignments
        </Link>
        .
      </p>
      {mutation.isError && Object.keys(errors).length === 0 && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <div>
        <Button
          type="submit"
          disabled={
            values.displayName.trim().length < 3 ||
            !values.email.trim() ||
            mutation.isPending
          }
        >
          Add user
        </Button>
      </div>
    </form>
  );
}

function EditInstitution({ institution }: { institution: ManagedInstitution }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const initial: InstitutionUpdate = {
    name: institution.name,
    type: institution.type,
    focalContact: institution.focalContact,
    accountingOfficerContact: institution.accountingOfficerContact,
  };
  const [values, setValues] = useState(initial);
  const mutation = useMutation({
    mutationFn: () => updateInstitution(institution.id, values),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries();
    },
  });
  const errors = isApiError(mutation.error) ? mutation.error.fieldErrors : {};
  const field = (key: keyof InstitutionUpdate, label: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`inst-${institution.id}-${key}`}>{label}</Label>
      <Input
        id={`inst-${institution.id}-${key}`}
        value={values[key]}
        onChange={(event) =>
          setValues({ ...values, [key]: event.target.value })
        }
      />
      {errors[key] && <p className="text-sm text-destructive">{errors[key]}</p>}
    </div>
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValues(initial);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit<span className="sr-only"> {institution.id}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {institution.id}</DialogTitle>
          <DialogDescription>
            The institution ID stays the same, so reports, receipts and results
            remain linked when the display name changes.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {field('name', 'Display name')}
          {field('type', 'Type')}
          {field('focalContact', 'Focal contact')}
          {field('accountingOfficerContact', 'Accounting Officer contact')}
          {mutation.isError && Object.keys(errors).length === 0 && (
            <p role="alert" className="text-sm text-destructive">
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
            <Button type="submit" disabled={mutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function officerScope(user: ManagedUser) {
  const ids = user.assignedInstitutionIds;
  if (!ids.length) return 'No institutions assigned';
  return ids.length <= 6
    ? ids.join(', ')
    : `${ids.length} institutions (${ids.slice(0, 3).join(', ')}, …)`;
}

function UsersTab({
  users,
  institutions,
  selfId,
}: {
  users: ManagedUser[];
  institutions: ManagedInstitution[];
  selfId: string;
}) {
  const controls = useListControls(
    users,
    (user) =>
      `${user.displayName} ${user.email} ${roleLabel[user.role]} ${user.institutionId ?? ''} ${user.active ? 'active' : 'deactivated'}`,
  );
  return (
    <div className="grid grid-cols-1 gap-4">
      <ListSearch
        controls={controls}
        label="Find a user"
        placeholder="Name, email, role or institution ID"
      />
      <div className="overflow-x-auto rounded-lg border bg-card">
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
                  <span className="block font-medium">{user.displayName}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {user.email}
                  </span>
                </TableHead>
                <TableCell>{roleLabel[user.role]}</TableCell>
                <TableCell className="text-sm whitespace-normal">
                  {user.role === 'institution'
                    ? user.institutionId
                    : user.role === 'officer'
                      ? officerScope(user)
                      : 'All institutions'}
                </TableCell>
                <TableCell>
                  <Badge variant={user.active ? 'outline' : 'secondary'}>
                    {user.active ? 'Active' : 'Deactivated'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.id === selfId ? (
                    <span className="text-sm text-muted-foreground">You</span>
                  ) : (
                    <StatusChange user={user} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPager controls={controls} noun="users" />
      <AddUser institutions={institutions} />
    </div>
  );
}

function InstitutionsTab({
  institutions,
  officers,
}: {
  institutions: ManagedInstitution[];
  officers: ManagedUser[];
}) {
  const controls = useListControls(
    institutions,
    (institution) =>
      `${institution.id} ${institution.name} ${institution.type} ${institution.focalContact}`,
  );
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ListSearch
          controls={controls}
          label="Find an institution"
          placeholder="ID, name, type or contact"
        />
        <div className="flex flex-wrap gap-2">
          <AddInstitution officers={officers} />
          <ImportInstitutions />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableCaption className="sr-only">Institutions</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Institution</TableHead>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">Contacts</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {controls.visible.map((institution) => (
              <TableRow key={institution.id}>
                <TableHead scope="row" className="whitespace-normal">
                  <span className="block font-medium">{institution.id}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {institution.name}
                  </span>
                </TableHead>
                <TableCell className="whitespace-normal">
                  {institution.type}
                </TableCell>
                <TableCell className="text-sm whitespace-normal">
                  <span className="block">{institution.focalContact}</span>
                  <span className="block text-muted-foreground">
                    {institution.accountingOfficerContact}
                  </span>
                </TableCell>
                <TableCell>
                  <EditInstitution institution={institution} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPager controls={controls} noun="institutions" />
    </div>
  );
}

export function PeoplePage() {
  const session = useSession();
  const people = useQuery(peopleQuery);
  const [tab, setTab] = useState('institutions');
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Setup"
        title="Users and institutions"
        description="Institutions, accounts, their role and scope (FR01). Add institutions one at a time or import a CSV. Deactivating an account ends its session at once and keeps everything it recorded."
      />
      <QueryView query={people} label="users and institutions">
        {(data) => (
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="grid grid-cols-1 gap-4"
          >
            <TabsList>
              <TabsTrigger value="institutions">
                Institutions ({data.institutions.length})
              </TabsTrigger>
              <TabsTrigger value="users">
                Users ({data.users.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="institutions">
              <InstitutionsTab
                institutions={data.institutions}
                officers={data.users.filter(
                  (user) => user.role === 'officer' && user.active,
                )}
              />
            </TabsContent>
            <TabsContent value="users">
              <UsersTab
                users={data.users}
                institutions={data.institutions}
                selfId={session.user.id}
              />
            </TabsContent>
          </Tabs>
        )}
      </QueryView>
    </div>
  );
}
