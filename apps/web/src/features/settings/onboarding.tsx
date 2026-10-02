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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
    <div className="flex items-start gap-2 rounded-md border bg-base-lightest p-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-1"
      />
      <div className="grid gap-1">
        <Label htmlFor={id} className="font-normal">
          Load seeded historical baselines for quarters that have already opened
        </Label>
        <p className="text-xs text-base-dark">
          Simulation only (PRD §10.4): the committee milestones are loaded and
          the officer confirms them before any score is finalized. Without this,
          those quarters stay pending baseline approval.
        </p>
      </div>
    </div>
  );
}

const blank = (
  officerId: string | null,
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

const UNTICK = 'or untick “Create a focal person account now”';

/**
 * What still stops the Add institution form, in the person's words. The form lists these on
 * submit rather than disabling the button without saying why. `focal` is null when no focal
 * person is being created. The API checks the same rules.
 */
export function institutionFormProblems(
  values: InstitutionCreate,
  focal: { displayName: string; email: string } | null,
) {
  const problems: string[] = [];
  if (!/^[A-Z]+-\d{3}$/.test(values.id.trim().toUpperCase()))
    problems.push(
      'Institution ID: use capital letters, a hyphen and three digits, e.g. MDA-123.',
    );
  if (values.name.trim().length < 3)
    problems.push('Name: give at least 3 characters.');
  if (!values.typeId) problems.push('Type: choose one.');
  if (values.accountingOfficer.name.trim().length < 3)
    problems.push('Accounting Officer name: give at least 3 characters.');
  if (values.accountingOfficer.designation.trim().length < 2)
    problems.push(
      'Accounting Officer designation: give at least 2 characters.',
    );
  if (focal && focal.displayName.trim().length < 3)
    problems.push(`Focal person name: give at least 3 characters, ${UNTICK}.`);
  if (focal && !focal.email.trim())
    problems.push(`Focal person email: enter it, ${UNTICK}.`);
  return problems;
}

export function AddInstitution({
  officers,
  supervisors,
  types,
}: {
  officers: ManagedUser[];
  supervisors: ManagedUser[];
  types: InstitutionType[];
}) {
  // With one officer or supervisor, new institutions go to them unless the administrator says
  // otherwise. Both are optional and can be assigned later.
  const defaultOfficer = officers.length === 1 ? officers[0]!.id : null;
  const defaultSupervisor =
    supervisors.length === 1 ? supervisors[0]!.id : null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() =>
    blank(defaultOfficer, defaultSupervisor),
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
  const problems = institutionFormProblems(values, withFocal ? focal : null);
  // Problems are listed only after a first attempt, then update as fields are fixed.
  const [tried, setTried] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTried(false);
          setValues(blank(defaultOfficer, defaultSupervisor));
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
      <DialogContent className="max-h-[90svh] overflow-y-auto tablet:max-w-measure">
        <DialogHeader>
          <DialogTitle>Add an institution</DialogTitle>
          <DialogDescription>
            It gets four reporting obligations and an empty plan, which its
            focal persons fill in and propose to the reviewing officer quarter
            by quarter.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setTried(true);
            if (problems.length === 0) mutation.mutate();
          }}
        >
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-bold">Institution</legend>
            <div data-columns className="grid gap-3 tablet:grid-cols-2">
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
            <div className="grid gap-2">
              <Label htmlFor={`${id}-officer`}>Reviewing officer</Label>
              <Combobox
                id={`${id}-officer`}
                searchPlaceholder="Search officers"
                value={values.officerId ?? ''}
                onChange={(officerId) =>
                  setValues({ ...values, officerId: officerId || null })
                }
                allOption="No reviewing officer yet"
                describedBy={`${id}-officer-hint`}
                options={officers.map((officer) => ({
                  value: officer.id,
                  label: officer.displayName,
                  description: `${officer.assignedInstitutionIds.length} institutions`,
                }))}
              />
              <p id={`${id}-officer-hint`} className="text-xs text-base-dark">
                Optional. Assign one later under Assignments; until then nobody
                reviews its reports.
              </p>
            </div>
            <div className="grid gap-2">
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
                className="text-xs text-base-dark"
              >
                Optional. Supervisors see only the institutions assigned to
                them.
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
            <legend className="mb-2 text-sm font-bold">Focal person</legend>
            <p className="text-xs text-base-dark">
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
              <div data-columns className="grid gap-3 tablet:grid-cols-2">
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
          {tried && problems.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Before adding the institution</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {mutation.isError && (
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
            <Button type="submit" disabled={mutation.isPending}>
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
    <div
      tabIndex={0}
      role="region"
      aria-label="Rows in the file"
      className="max-h-80 overflow-auto rounded-md border"
    >
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
                <span className="block font-bold">
                  {row.institutionId || '—'}
                </span>
                <span className="block text-xs text-base-dark">{row.name}</span>
              </TableHead>
              <TableCell className="text-sm">
                {row.officerName ?? '—'}
              </TableCell>
              <TableCell className="text-sm">
                {row.supervisorName ?? 'None'}
              </TableCell>
              <TableCell className="text-sm whitespace-normal">
                {row.errors.length ? (
                  <ul className="list-disc pl-4 text-error-dark">
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
        <p className="p-2 text-xs text-base-dark">
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
      <DialogContent className="max-h-[90svh] overflow-y-auto tablet:max-w-measure">
        <DialogHeader>
          <DialogTitle>Import institutions</DialogTitle>
          <DialogDescription>
            Every row is checked first. Nothing is created unless all rows are
            ready, so a file can be fixed and loaded again.
          </DialogDescription>
        </DialogHeader>
        {run.isSuccess ? (
          <div className="grid gap-3">
            <p role="status" className="font-bold">
              {run.data.created.length} institutions imported
              {run.data.focalUsers > 0 &&
                `, with ${run.data.focalUsers} focal person accounts`}
              .
            </p>
            <p className="text-sm text-base-dark">
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
                  institution_id, name, type, ao_name, ao_designation
                </code>
                . Officers are matched by email (leave{' '}
                <code className="text-xs">officer_email</code> blank to assign
                one later) and types by name (
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
            <div className="grid gap-2">
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
              <p role="alert" className="text-sm text-error-dark">
                {preview.error.message}
              </p>
            )}
            {result && (
              <div className="grid gap-2">
                {result.fileErrors.length > 0 ? (
                  <ul
                    role="alert"
                    className="list-disc pl-5 text-sm text-error-dark"
                  >
                    {result.fileErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : (
                  <p
                    role="status"
                    className={
                      result.invalid ? 'font-bold text-error-dark' : 'font-bold'
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
              <p role="alert" className="text-sm text-error-dark">
                {run.error.message}
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
