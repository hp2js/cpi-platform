import {
  institutionImportColumns,
  institutionImportOptionalColumns,
  type InstitutionCreate,
  type InstitutionType,
  type InstitutionImportPreview,
  type ManagedUser,
} from '@cpi/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Download, Plus, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import { Combobox } from '@/components/combobox';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { isApiError } from '@/lib/api';
import {
  AccountingOfficerFields,
  emptyAccountingOfficer,
  InstitutionTypeSelect,
  TextField,
} from './institution-form';
import {
  createInstitution,
  importInstitutions,
  previewInstitutionImport,
} from './queries';

/**
 * Onboarding institutions (FR01). New institutions start with an empty plan: their focal
 * persons record it and propose each quarter's baseline (FR04). Quarters that have already
 * opened can take a simulation-only SEEDED HISTORICAL BASELINE (PRD §10.4); without it they
 * stay pending baseline approval, because a baseline cannot be activated after a quarter opens.
 */

function SeedOption({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="font-normal">
          Load seeded historical baselines for quarters that have already opened
        </Label>
        <p className="text-xs text-muted-foreground">
          Simulation only (PRD §10.4): the committee milestones are loaded and
          the officer confirms them before any score is finalized. Without this,
          those quarters stay pending baseline approval.
        </p>
      </div>
    </div>
  );
}

const blank = (
  officerId: string,
  supervisorId: string | null,
): InstitutionCreate => ({
  id: '',
  name: '',
  typeId: '',
  officerId,
  supervisorId,
  accountingOfficer: emptyAccountingOfficer,
  focalUser: null,
  seedOpenedQuarters: true,
});

export function AddInstitution({
  officers,
  supervisors,
  types,
}: {
  officers: ManagedUser[];
  supervisors: ManagedUser[];
  types: InstitutionType[];
}) {
  // With one supervisor, new institutions go to them unless the administrator says otherwise.
  const defaultSupervisor =
    supervisors.length === 1 ? supervisors[0]!.id : null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() =>
    blank(officers[0]?.id ?? '', defaultSupervisor),
  );
  const [withFocal, setWithFocal] = useState(true);
  const [focal, setFocal] = useState({
    displayName: '',
    email: '',
    jobTitle: 'Integrity Assurance Officer',
  });
  const mutation = useMutation({
    mutationFn: () =>
      createInstitution({
        ...values,
        id: values.id.trim().toUpperCase(),
        focalUser: withFocal ? focal : null,
      }),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries();
      await navigate({
        to: '/admin/institutions/$institutionId',
        params: { institutionId: values.id.trim().toUpperCase() },
      });
    },
  });
  const errors = isApiError(mutation.error) ? mutation.error.fieldErrors : {};
  const ready =
    /^[A-Z]+-\d{3}$/.test(values.id.trim().toUpperCase()) &&
    values.name.trim().length >= 3 &&
    values.typeId &&
    values.officerId &&
    values.accountingOfficer.name.trim().length >= 3 &&
    values.accountingOfficer.designation.trim().length >= 2 &&
    (!withFocal ||
      (focal.displayName.trim().length >= 3 && focal.email.trim()));
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(blank(officers[0]?.id ?? '', defaultSupervisor));
          setFocal({
            displayName: '',
            email: '',
            jobTitle: 'Integrity Assurance Officer',
          });
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Add institution
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add an institution</DialogTitle>
          <DialogDescription>
            It gets four reporting obligations, a reviewing officer and an empty
            plan, which its focal persons fill in and propose to the officer
            quarter by quarter.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-semibold">Institution</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id={`${id}-id`}
                label="Institution ID"
                hint="Stable code, e.g. MDA-123. It never changes."
                value={values.id}
                onChange={(next) =>
                  setValues({ ...values, id: next.toUpperCase() })
                }
                error={errors.id}
              />
              <InstitutionTypeSelect
                id={`${id}-type`}
                value={values.typeId}
                onChange={(typeId) => setValues({ ...values, typeId })}
                types={types}
                error={errors.typeId}
              />
            </div>
            <TextField
              id={`${id}-name`}
              label="Name"
              value={values.name}
              onChange={(name) => setValues({ ...values, name })}
              error={errors.name}
            />
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-officer`}>Reviewing officer</Label>
              <Combobox
                id={`${id}-officer`}
                searchPlaceholder="Search officers"
                value={values.officerId}
                onChange={(officerId) => setValues({ ...values, officerId })}
                options={officers.map((officer) => ({
                  value: officer.id,
                  label: officer.displayName,
                  description: `${officer.assignedInstitutionIds.length} institutions`,
                }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-supervisor`}>Supervisor</Label>
              <SelectField
                id={`${id}-supervisor`}
                value={values.supervisorId ?? ''}
                onChange={(supervisorId) =>
                  setValues({ ...values, supervisorId: supervisorId || null })
                }
                options={[
                  { value: '', label: 'No supervisor yet' },
                  ...supervisors.map((supervisor) => ({
                    value: supervisor.id,
                    label: `${supervisor.displayName} (${supervisor.assignedInstitutionIds.length} institutions)`,
                  })),
                ]}
                describedBy={`${id}-supervisor-hint`}
              />
              <p
                id={`${id}-supervisor-hint`}
                className="text-xs text-muted-foreground"
              >
                Supervisors see only the institutions assigned to them.
              </p>
            </div>
          </fieldset>

          <AccountingOfficerFields
            idPrefix={id}
            value={values.accountingOfficer}
            onChange={(accountingOfficer) =>
              setValues({ ...values, accountingOfficer })
            }
            errors={errors}
          />

          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-semibold">Focal person</legend>
            <p className="text-xs text-muted-foreground">
              The person who reports for the institution on the platform. More
              focal persons can be added later from the institution’s page.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${id}-with-focal`}
                checked={withFocal}
                onCheckedChange={(value) => setWithFocal(value === true)}
              />
              <Label htmlFor={`${id}-with-focal`} className="font-normal">
                Create a focal person account now
              </Label>
            </div>
            {withFocal && (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  id={`${id}-focal-name`}
                  label="Name"
                  value={focal.displayName}
                  onChange={(displayName) =>
                    setFocal({ ...focal, displayName })
                  }
                />
                <TextField
                  id={`${id}-focal-email`}
                  label="Email (sign-in)"
                  type="email"
                  placeholder="name@example.invalid"
                  value={focal.email}
                  onChange={(email) => setFocal({ ...focal, email })}
                />
                <TextField
                  id={`${id}-focal-title`}
                  label="Job title"
                  optional
                  value={focal.jobTitle}
                  onChange={(jobTitle) => setFocal({ ...focal, jobTitle })}
                />
              </div>
            )}
          </fieldset>

          <SeedOption
            id={`${id}-seed`}
            checked={values.seedOpenedQuarters}
            onChange={(seedOpenedQuarters) =>
              setValues({ ...values, seedOpenedQuarters })
            }
          />
          {mutation.isError && (
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
            <Button type="submit" disabled={!ready || mutation.isPending}>
              {mutation.isPending ? 'Adding…' : 'Add institution'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const template = [
  [...institutionImportColumns, ...institutionImportOptionalColumns].join(','),
  'MDA-201,Demo Tea Board,State corporation,officer.a@example.invalid,Accounting Officer MDA-201,Managing Director,ao.mda-201@example.invalid,,Focal person MDA-201,focal.mda-201@example.invalid,supervisor@example.invalid',
  '"MDA-202","Demo Fisheries Service, Coast",State agency,officer.b@example.invalid,Accounting Officer MDA-202,Director General,,,,,',
].join('\r\n');

function downloadTemplate() {
  const url = URL.createObjectURL(
    new Blob([`${template}\r\n`], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'institutions-template.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function PreviewTable({ preview }: { preview: InstitutionImportPreview }) {
  const shown = [
    ...preview.rows.filter((row) => row.errors.length),
    ...preview.rows.filter((row) => !row.errors.length),
  ].slice(0, 200);
  return (
    <div className="max-h-80 overflow-auto rounded-md border">
      <Table>
        <TableCaption className="sr-only">
          Rows in the file, problems first
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Line</TableHead>
            <TableHead scope="col">Institution</TableHead>
            <TableHead scope="col">Officer</TableHead>
            <TableHead scope="col">Supervisor</TableHead>
            <TableHead scope="col">Check</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => (
            <TableRow key={row.line}>
              <TableCell>{row.line}</TableCell>
              <TableHead scope="row" className="font-normal whitespace-normal">
                <span className="block font-medium">
                  {row.institutionId || '—'}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {row.name}
                </span>
              </TableHead>
              <TableCell className="text-sm">
                {row.officerName ?? '—'}
              </TableCell>
              <TableCell className="text-sm">
                {row.supervisorName ?? 'None'}
              </TableCell>
              <TableCell className="text-sm whitespace-normal">
                {row.errors.length ? (
                  <ul className="list-disc pl-4 text-destructive">
                    {row.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : (
                  'Ready'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {preview.rows.length > shown.length && (
        <p className="p-2 text-xs text-muted-foreground">
          Showing {shown.length} of {preview.rows.length} rows, problems first.
        </p>
      )}
    </div>
  );
}

export function ImportInstitutions({ types }: { types: InstitutionType[] }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [seed, setSeed] = useState(true);
  const preview = useMutation({
    mutationFn: (text: string) => previewInstitutionImport(text, true),
  });
  const run = useMutation({
    mutationFn: () => importInstitutions(csv!.text, seed),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const result = preview.data;
  const ready =
    result && !result.fileErrors.length && result.invalid === 0 && result.valid;

  async function choose(file: File | undefined) {
    run.reset();
    if (!file) return;
    const text = await file.text();
    setCsv({ name: file.name, text });
    preview.mutate(text);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setCsv(null);
          preview.reset();
          run.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload aria-hidden="true" />
          Import from CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import institutions</DialogTitle>
          <DialogDescription>
            Every row is checked first. Nothing is created unless all rows are
            ready, so a file can be fixed and loaded again.
          </DialogDescription>
        </DialogHeader>
        {run.isSuccess ? (
          <div className="grid gap-3">
            <p role="status" className="font-medium">
              {run.data.created.length} institutions imported
              {run.data.focalUsers > 0 &&
                `, with ${run.data.focalUsers} focal person accounts`}
              .
            </p>
            <p className="text-sm text-muted-foreground">
              Their officers were notified. Each institution’s focal persons
              record its plan and propose each quarter’s baseline.
            </p>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1 text-sm">
              <p>
                Columns:{' '}
                <code className="text-xs">
                  {[
                    ...institutionImportColumns,
                    ...institutionImportOptionalColumns,
                  ].join(', ')}
                </code>
                . Required:{' '}
                <code className="text-xs">
                  institution_id, name, type, officer_email, ao_name,
                  ao_designation
                </code>
                . Officers are matched by email and types by name (
                {types
                  .filter((type) => type.active)
                  .map((type) => type.label)
                  .join(', ')}
                ). Supervisors are matched by email; leave{' '}
                <code className="text-xs">supervisor_email</code> blank to use
                the only active supervisor, if there is exactly one.
              </p>
              <div>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={downloadTemplate}
                >
                  <Download aria-hidden="true" />
                  Download a template
                </Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-file`}>CSV file</Label>
              <Input
                id={`${id}-file`}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void choose(event.target.files?.[0])}
              />
            </div>
            <SeedOption id={`${id}-seed`} checked={seed} onChange={setSeed} />
            {preview.isPending && <p className="text-sm">Checking the file…</p>}
            {preview.isError && (
              <p role="alert" className="text-sm text-destructive">
                {preview.error.message}
              </p>
            )}
            {result && (
              <div className="grid gap-2">
                {result.fileErrors.length > 0 ? (
                  <ul
                    role="alert"
                    className="list-disc pl-5 text-sm text-destructive"
                  >
                    {result.fileErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : (
                  <p
                    role="status"
                    className={
                      result.invalid
                        ? 'font-medium text-destructive'
                        : 'font-medium'
                    }
                  >
                    {csv?.name}: {result.valid} ready
                    {result.invalid > 0 &&
                      `, ${result.invalid} ${result.invalid === 1 ? 'row needs' : 'rows need'} attention`}
                  </p>
                )}
                {result.rows.length > 0 && <PreviewTable preview={result} />}
              </div>
            )}
            {run.isError && (
              <p role="alert" className="text-sm text-destructive">
                {run.error.message}
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
                type="button"
                disabled={!ready || run.isPending}
                onClick={() => run.mutate()}
              >
                {run.isPending
                  ? 'Importing…'
                  : ready
                    ? `Import ${result.valid} institutions`
                    : 'Import'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
