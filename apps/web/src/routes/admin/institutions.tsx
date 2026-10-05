import type {
  InstitutionType,
  ManagedInstitution,
  ManagedUser,
} from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  ListPager,
  ListSearch,
  useListControls,
} from '@/components/list-controls';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { SelectField } from '@/components/select-field';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TextField } from '@/features/settings/institution-form';
import {
  AddInstitution,
  ImportInstitutions,
} from '@/features/settings/onboarding';
import { peopleQuery, saveInstitutionType } from '@/features/settings/queries';
import { isApiError } from '@/lib/api';

const route = getRouteApi('/authed/admin/institutions');

function InstitutionsTable({
  institutions,
  types,
}: {
  institutions: ManagedInstitution[];
  types: InstitutionType[];
}) {
  const [typeId, setTypeId] = useState('');
  const filtered = useMemo(
    () =>
      typeId
        ? institutions.filter((institution) => institution.typeId === typeId)
        : institutions,
    [institutions, typeId],
  );
  const controls = useListControls(
    filtered,
    (institution) =>
      `${institution.id} ${institution.name} ${institution.type} ${institution.officer?.name ?? ''} ${institution.accountingOfficer?.name ?? ''} ${institution.focalPersons.map((person) => `${person.displayName} ${person.email}`).join(' ')}`,
  );
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <ListSearch
          controls={controls}
          label="Find an institution"
          placeholder="ID, name, officer or contact"
        />
        <div className="grid w-60 gap-2">
          <Label htmlFor="institution-type-filter">Type</Label>
          <SelectField
            id="institution-type-filter"
            value={typeId}
            onChange={setTypeId}
            options={[
              { value: '', label: `All types (${institutions.length})` },
              ...types
                .filter((type) => type.institutionCount > 0 || type.active)
                .map((type) => ({
                  value: type.id,
                  label: `${type.label} (${type.institutionCount})`,
                })),
            ]}
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table className="min-w-[52rem]">
          <TableCaption className="sr-only">Institutions</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Institution</TableHead>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">Reviewing officer</TableHead>
              <TableHead scope="col">Accounting Officer</TableHead>
              <TableHead scope="col">Focal persons</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {controls.visible.map((institution) => (
              <TableRow key={institution.id}>
                <TableHead scope="row" className="whitespace-normal">
                  <Link
                    to="/admin/institutions/$institutionId"
                    params={{ institutionId: institution.id }}
                    className="block font-bold text-primary underline-offset-4 hover:underline"
                  >
                    {institution.id}
                    <span className="block text-xs font-normal text-base-dark">
                      {institution.name}
                    </span>
                  </Link>
                </TableHead>
                <TableCell className="whitespace-normal">
                  {institution.type}
                </TableCell>
                <TableCell>
                  {institution.officer?.name ?? 'Unassigned'}
                </TableCell>
                <TableCell className="text-sm whitespace-normal">
                  {institution.accountingOfficer ? (
                    <>
                      <span className="block">
                        {institution.accountingOfficer.name}
                      </span>
                      <span className="block text-base-dark">
                        {institution.accountingOfficer.designation}
                      </span>
                    </>
                  ) : (
                    <span className="text-error-dark">Not recorded</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {/* Invited accounts have not yet chosen their own password. */}
                  {institution.focalPersons.filter(
                    (person) => person.status === 'active',
                  ).length || (
                    <span className="text-error-dark">
                      None active
                      {institution.focalPersons.some(
                        (person) => person.status === 'invited',
                      ) && ' (invited)'}
                    </span>
                  )}
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

function TypeDialog({
  type,
  trigger,
}: {
  type?: InstitutionType;
  trigger: ReactNode;
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(type?.label ?? '');
  const mutation = useMutation({
    mutationFn: () =>
      saveInstitutionType({ label, active: type?.active ?? true }, type?.id),
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
          setLabel(type?.label ?? '');
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type ? `Rename ${type.label}` : 'Add an institution type'}
          </DialogTitle>
          <DialogDescription>
            {type
              ? `The ${type.institutionCount} institutions of this type show the new name; their records keep the same type.`
              : 'New types can be chosen when adding or editing an institution, and in CSV imports.'}
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
            id={`${id}-label`}
            label="Name"
            value={label}
            onChange={setLabel}
            error={errors.label}
          />
          {mutation.isError && !errors.label && (
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
              disabled={label.trim().length < 3 || mutation.isPending}
            >
              {type ? 'Save' : 'Add type'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TypeStatus({ type }: { type: InstitutionType }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      saveInstitutionType({ label: type.label, active: !type.active }, type.id),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {type.active ? 'Retire' : 'Reactivate'}
        <span className="sr-only"> {type.label}</span>
      </Button>
      {mutation.isError && (
        <p role="alert" className="text-sm text-error-dark">
          {mutation.error.message}
        </p>
      )}
    </>
  );
}

function TypesTable({ types }: { types: InstitutionType[] }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-measure text-sm text-base-dark">
          The list offered when adding or editing an institution and matched by
          name in CSV imports. Retiring a type keeps it on the institutions that
          have it but stops it being chosen for new ones.
        </p>
        <TypeDialog
          trigger={
            <Button>
              <Plus aria-hidden="true" />
              Add type
            </Button>
          }
        />
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table>
          <TableCaption className="sr-only">Institution types</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">Institutions</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((type) => (
              <TableRow key={type.id}>
                <TableHead scope="row">{type.label}</TableHead>
                <TableCell className="tabular-nums">
                  {type.institutionCount}
                </TableCell>
                <TableCell>
                  <Badge variant={type.active ? 'outline' : 'secondary'}>
                    {type.active ? 'In use' : 'Retired'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <TypeDialog
                      type={type}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Rename<span className="sr-only"> {type.label}</span>
                        </Button>
                      }
                    />
                    <TypeStatus type={type} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function InstitutionsPage() {
  const { tab = 'institutions' } = route.useSearch();
  const navigate = useNavigate();
  const people = useQuery(peopleQuery);
  const officers: ManagedUser[] = (people.data?.users ?? []).filter(
    (user) => user.role === 'officer' && user.active,
  );
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Setup"
        title="Institutions"
        description="Every reporting institution, its type, reviewing officer, Accounting Officer and focal persons (FR01). Open an institution to change its details."
        actions={
          people.data && (
            <div className="flex flex-wrap gap-2">
              <AddInstitution
                officers={officers}
                supervisors={people.data.users.filter(
                  (user) => user.role === 'supervisor' && user.active,
                )}
                types={people.data.institutionTypes}
              />
              <ImportInstitutions types={people.data.institutionTypes} />
            </div>
          )
        }
      />
      <QueryView query={people} label="institutions">
        {(data) => (
          <Tabs
            value={tab}
            onValueChange={(next) =>
              void navigate({
                to: '/admin/institutions',
                search: { tab: next === 'types' ? 'types' : undefined },
                replace: true,
              })
            }
            className="grid grid-cols-1 gap-4"
          >
            <TabsList>
              <TabsTrigger value="institutions">
                Institutions ({data.institutions.length})
              </TabsTrigger>
              <TabsTrigger value="types">
                Institution types ({data.institutionTypes.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="institutions">
              <InstitutionsTable
                institutions={data.institutions}
                types={data.institutionTypes}
              />
            </TabsContent>
            <TabsContent value="types">
              <TypesTable types={data.institutionTypes} />
            </TabsContent>
          </Tabs>
        )}
      </QueryView>
    </div>
  );
}
