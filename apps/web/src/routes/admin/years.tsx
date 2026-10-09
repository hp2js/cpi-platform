import {
  yearEnd,
  yearInput,
  yearNaming,
  yearQuarters,
  type FinancialYear,
  type FinancialYearInput,
  type FinancialYears,
} from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarCheck, CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { SelectField } from '@/components/select-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUnsavedWork } from '@/features/session/unsaved-work';
import { calendarQuery } from '@/features/settings/queries';
import {
  discardYear,
  openYear,
  planYear,
  updateYear,
  yearsKeys,
  yearsQuery,
} from '@/features/years/queries';
import { isApiError } from '@/lib/api';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

const statusLabel: Record<FinancialYear['status'], string> = {
  active: 'Active',
  planned: 'Planned',
  closed: 'Closed',
};

const DAY = 86_400_000;
const days = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const plus = (date: string, count: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + count * DAY)
    .toISOString()
    .slice(0, 10);

/**
 * Moving the start moves the whole year: each deadline keeps its distance from its quarter's
 * end, the foundation deadline its distance from the start and the cutoff from the year's end.
 * The server checks the result against the rules either way.
 */
function moveStart(input: FinancialYearInput, startsOn: string) {
  if (
    !/^\d{4}-\d{2}-01$/.test(startsOn) ||
    !/^\d{4}-\d{2}-01$/.test(input.startsOn)
  )
    return { ...input, startsOn };
  const before = yearQuarters(input.startsOn);
  const after = yearQuarters(startsOn);
  const named = yearNaming(input.startsOn).label === input.label.trim();
  return {
    ...input,
    startsOn,
    label: named ? yearNaming(startsOn).label : input.label,
    deadlines: input.deadlines.map((deadline, index) =>
      plus(after[index]!.endsOn, days(before[index]!.endsOn, deadline)),
    ),
    foundationDeadlineDate: plus(
      startsOn,
      days(input.startsOn, input.foundationDeadlineDate),
    ),
    evaluationCutoffDate: plus(
      yearEnd(startsOn),
      days(yearEnd(input.startsOn), input.evaluationCutoffDate),
    ),
  };
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-base-dark">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm font-bold text-error-dark">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint: boolean, error?: string) =>
  [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') ||
  undefined;

/** One year: its state, dates, quarters and profile. */
function YearCard({
  year,
  children,
}: {
  year: FinancialYear;
  children?: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'grid gap-4 rounded-lg border bg-white p-5',
        year.status === 'active' && 'border-l-4 border-l-primary',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id={headingId}
            className="flex items-center gap-2 text-lg font-bold"
          >
            {year.label}
            <Badge variant={year.status === 'active' ? 'default' : 'outline'}>
              {statusLabel[year.status]}
            </Badge>
          </h2>
          <p className="text-sm text-base-dark">
            {formatCalendarDate(year.startsOn)} to{' '}
            {formatCalendarDate(year.endsOn)} · {year.timezone} · Scoring
            profile {year.profileName}
          </p>
          {year.plannedBy && year.plannedAt && (
            <p className="text-sm text-base-dark">
              Planned by {year.plannedBy}, {formatDateTime(year.plannedAt)}
            </p>
          )}
          {year.closedBy && year.closedAt && (
            <p className="text-sm text-base-dark">
              Closed by {year.closedBy}, {formatDateTime(year.closedAt)}
              {year.pending.length > 0 &&
                ` · ${year.pending.length} result${year.pending.length === 1 ? '' : 's'} never published`}
            </p>
          )}
        </div>
        {children}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <caption className="sr-only">{year.label} quarters</caption>
          <thead className="border-b">
            <tr>
              <th scope="col" className="py-2 pr-4 font-bold">
                Quarter
              </th>
              <th scope="col" className="py-2 pr-4 font-bold">
                Period
              </th>
              <th scope="col" className="py-2 font-bold">
                Reports due
              </th>
            </tr>
          </thead>
          <tbody>
            {year.periods.map((period) => (
              <tr key={period.id} className="border-b last:border-0">
                <th scope="row" className="py-2 pr-4 font-bold">
                  {period.label}
                </th>
                <td className="py-2 pr-4">
                  {formatCalendarDate(period.startsOn)} to{' '}
                  {formatCalendarDate(period.endsOn)}
                </td>
                <td className="py-2">
                  {formatDateTime(period.submissionDeadline)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm tablet:grid-cols-[auto_1fr]">
        <dt className="font-bold">Foundation documents due</dt>
        <dd>{formatDateTime(year.foundationDeadline)}</dd>
        <dt className="font-bold">Evaluation cutoff</dt>
        <dd>{formatDateTime(year.evaluationCutoff)}</dd>
      </dl>
    </section>
  );
}

/** Plan a new year, or change a planned one. Every date can be reviewed before saving. */
function YearForm({
  initial,
  profiles,
  editing,
  onDone,
}: {
  initial: FinancialYearInput;
  profiles: FinancialYears['profiles'];
  /** The planned year being changed; absent when planning a new one. */
  editing?: FinancialYear;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(initial);
  const [reason, setReason] = useState('');
  const dirty =
    JSON.stringify(values) !== JSON.stringify(initial) || reason !== '';
  useUnsavedWork(dirty);
  const save = useMutation({
    mutationFn: () =>
      editing
        ? updateYear(editing.id, {
            ...values,
            reason,
            baseRevision: editing.revision,
          })
        : planYear({ ...values, reason }),
    onSuccess: (result) => {
      queryClient.setQueryData(yearsKeys.all, result);
      onDone();
    },
  });
  const errors = isApiError(save.error) ? save.error.fieldErrors : {};
  const conflict = isApiError(save.error, 409);
  const quarters = /^\d{4}-\d{2}-\d{2}$/.test(values.startsOn)
    ? yearQuarters(values.startsOn)
    : [];
  const set = (patch: Partial<FinancialYearInput>) =>
    setValues((current) => ({ ...current, ...patch }));
  const title = editing
    ? `Change ${editing.label}`
    : 'Plan the next financial year';

  return (
    <form
      aria-labelledby="year-form-heading"
      className="grid gap-5 rounded-lg border bg-white p-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <h2 id="year-form-heading" className="text-lg font-bold">
          {title}
        </h2>
        <p className="text-sm text-base-dark">
          {editing
            ? 'Changes apply only to this planned year. The active year is not affected.'
            : 'Proposed from the current rules: four quarters of three months, each due the set number of days after it ends. Review every date before saving. Planning never changes the active year.'}
        </p>
      </div>

      <div className="grid gap-4 tablet:grid-cols-2">
        <Field
          id="year-start"
          label="Starts on"
          hint="The first day of a month. The year runs twelve months from it."
          error={errors.startsOn}
        >
          <Input
            id="year-start"
            type="date"
            className="w-48"
            value={values.startsOn}
            aria-invalid={Boolean(errors.startsOn)}
            aria-describedby={describedBy('year-start', true, errors.startsOn)}
            onChange={(event) =>
              setValues((current) => moveStart(current, event.target.value))
            }
          />
        </Field>
        <Field id="year-label" label="Name" error={errors.label}>
          <Input
            id="year-label"
            className="w-48"
            value={values.label}
            aria-invalid={Boolean(errors.label)}
            aria-describedby={describedBy('year-label', false, errors.label)}
            onChange={(event) => set({ label: event.target.value })}
          />
        </Field>
      </div>

      <fieldset className="grid gap-3">
        <legend className="font-bold">Quarterly reports due</legend>
        <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
          {values.deadlines.map((deadline, index) => {
            const quarter = quarters[index];
            const id = `year-deadline-${index}`;
            const error = errors[`deadlines.${index}`];
            return (
              <Field
                key={id}
                id={id}
                label={`Q${index + 1} deadline`}
                hint={
                  quarter
                    ? `Quarter ${formatCalendarDate(quarter.startsOn)} to ${formatCalendarDate(quarter.endsOn)}`
                    : undefined
                }
                error={error}
              >
                <Input
                  id={id}
                  type="date"
                  value={deadline}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy(id, Boolean(quarter), error)}
                  onChange={(event) =>
                    set({
                      deadlines: values.deadlines.map((value, at) =>
                        at === index ? event.target.value : value,
                      ),
                    })
                  }
                />
              </Field>
            );
          })}
        </div>
        <p className="text-xs text-base-dark">
          Reports are on time until 23:59:59 East Africa Time on the deadline
          date.
        </p>
      </fieldset>

      <div className="grid gap-4 tablet:grid-cols-3">
        <Field
          id="year-foundation"
          label="Foundation documents due"
          hint="Procedures, risk assessment and mitigation plan."
          error={errors.foundationDeadlineDate}
        >
          <Input
            id="year-foundation"
            type="date"
            value={values.foundationDeadlineDate}
            aria-invalid={Boolean(errors.foundationDeadlineDate)}
            aria-describedby={describedBy(
              'year-foundation',
              true,
              errors.foundationDeadlineDate,
            )}
            onChange={(event) =>
              set({ foundationDeadlineDate: event.target.value })
            }
          />
        </Field>
        <Field
          id="year-cutoff"
          label="Evaluation cutoff"
          hint="After the last quarterly deadline."
          error={errors.evaluationCutoffDate}
        >
          <Input
            id="year-cutoff"
            type="date"
            value={values.evaluationCutoffDate}
            aria-invalid={Boolean(errors.evaluationCutoffDate)}
            aria-describedby={describedBy(
              'year-cutoff',
              true,
              errors.evaluationCutoffDate,
            )}
            onChange={(event) =>
              set({ evaluationCutoffDate: event.target.value })
            }
          />
        </Field>
        <Field
          id="year-profile"
          label="Scoring profile"
          hint="Locked for the whole year once its first form is published."
          error={errors.profileId}
        >
          <SelectField
            id="year-profile"
            value={values.profileId}
            invalid={Boolean(errors.profileId)}
            describedBy={describedBy('year-profile', true, errors.profileId)}
            onChange={(profileId) => set({ profileId })}
            options={profiles.map((profile) => ({
              value: profile.id,
              label: profile.name,
            }))}
          />
        </Field>
      </div>

      <Field
        id="year-reason"
        label="Reason"
        hint="Recorded in the change log and the audit log."
        error={errors.reason}
      >
        <Textarea
          id="year-reason"
          rows={2}
          value={reason}
          aria-invalid={Boolean(errors.reason)}
          aria-describedby={describedBy('year-reason', true, errors.reason)}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>

      {save.isError && (
        <p role="alert" className="text-sm font-bold text-error-dark">
          {save.error.message}
          {conflict && (
            <Button
              type="button"
              variant="link"
              className="ml-2"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: yearsKeys.all });
                onDone();
              }}
            >
              Reload
            </Button>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={save.isPending}>
          <CalendarPlus aria-hidden="true" />
          {editing
            ? 'Save changes'
            : `Plan ${values.label.trim() || 'the year'}`}
        </Button>
        {editing && (
          <Button type="button" variant="plain" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function DiscardYear({ year }: { year: FinancialYear }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const discard = useMutation({
    mutationFn: () => discardYear(year.id, reason),
    onSuccess: (result) => queryClient.setQueryData(yearsKeys.all, result),
  });
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          setReason('');
          discard.reset();
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 aria-hidden="true" />
          Discard
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard the planned {year.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Nothing has happened in it yet, so nothing else changes. The reason
            is kept in the change log and the audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="discard-year-reason">Reason</Label>
          <Textarea
            id="discard-year-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        {discard.isError && (
          <p role="alert" className="text-sm text-error-dark">
            {discard.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={reason.trim().length < 10 || discard.isPending}
            onClick={(event) => {
              event.preventDefault();
              discard.mutate();
            }}
          >
            Discard {year.label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Opens the planned year once the active one is complete (HP2-100): says exactly what carries
 * over, what is archived and what starts afresh, and asks for a reason.
 */
function OpenYear({
  year,
  active,
}: {
  year: FinancialYear;
  active: FinancialYear;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [leavePending, setLeavePending] = useState(false);
  const opening = year.opening!;
  const open = useMutation({
    mutationFn: () => openYear(year.id, reason, leavePending),
    onSuccess: async (result) => {
      queryClient.setQueryData(yearsKeys.all, result);
      // Every screen's data belongs to the new year now.
      await queryClient.invalidateQueries();
    },
  });
  const errors = isApiError(open.error) ? open.error.fieldErrors : {};
  return (
    <AlertDialog
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setReason('');
          setLeavePending(false);
          open.reset();
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          disabled={!opening.ready}
          aria-describedby={opening.ready ? undefined : `${year.id}-blocked`}
        >
          <CalendarCheck aria-hidden="true" />
          Open {year.label}
        </Button>
      </AlertDialogTrigger>
      {!opening.ready && (
        <span id={`${year.id}-blocked`} className="sr-only">
          {opening.blocker}
        </span>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Open {year.label} and close {active.label}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. {active.label} becomes a closed year.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto text-sm">
          <section className="grid gap-1">
            <h3 className="font-bold">What happens</h3>
            <ul className="grid list-disc gap-1 pl-5">
              <li>
                {active.label}&rsquo;s published results and their history stay
                readable here, and each institution keeps its own under Results.
              </li>
              <li>
                Its reports, reviews, clarifications, plans, foundation
                documents and evidence are cleared from the working screens.
              </li>
              <li>
                Institutions, people, assignments, scoring profiles, calendar
                settings and the report identity carry over.
              </li>
              <li>
                Every institution gets {year.label}&rsquo;s four quarters,
                reporting on the last published form until a new version is
                published. Plans and foundation documents start afresh: nothing
                is assumed achieved again.
              </li>
              <li>Institution users, officers and supervisors are notified.</li>
            </ul>
          </section>
          {opening.pending.length > 0 && (
            <section className="grid gap-2">
              <h3 className="font-bold">
                {opening.pending.length} result
                {opening.pending.length === 1 ? '' : 's'} never published
              </h3>
              <ul className="grid list-disc gap-1 pl-5">
                {opening.pending.map((item) => (
                  <li key={item.institutionId}>
                    {item.institutionId} · {item.institutionName}
                  </li>
                ))}
              </ul>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="leave-pending"
                  className="mt-1"
                  checked={leavePending}
                  aria-invalid={Boolean(errors.leavePending)}
                  onCheckedChange={(checked) =>
                    setLeavePending(checked === true)
                  }
                />
                <Label htmlFor="leave-pending" className="font-normal">
                  Leave these results pending in {active.label}. They stay on
                  record as never published.
                </Label>
              </div>
            </section>
          )}
          <div className="grid gap-2">
            <Label htmlFor="open-year-reason">Reason</Label>
            <Textarea
              id="open-year-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {open.isError && (
            <p role="alert" className="font-bold text-error-dark">
              {open.error.message}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction
            disabled={
              reason.trim().length < 10 ||
              (opening.pending.length > 0 && !leavePending) ||
              open.isPending
            }
            onClick={(event) => {
              event.preventDefault();
              open.mutate();
            }}
          >
            Open {year.label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Years({ data }: { data: FinancialYears }) {
  const [editing, setEditing] = useState<string | null>(null);
  const active = data.years.find((year) => year.status === 'active');
  const planned = data.years.find((year) => year.status === 'planned');
  return (
    <div className="grid gap-6">
      {data.years.map((year) =>
        editing === year.id ? (
          <YearForm
            key={`${year.id}-${year.revision}`}
            initial={yearInput(year)}
            profiles={data.profiles}
            editing={year}
            onDone={() => setEditing(null)}
          />
        ) : (
          <YearCard key={year.id} year={year}>
            {year.status === 'active' && (
              <Link
                to="/admin/calendar"
                className="text-sm font-bold text-primary underline underline-offset-4"
              >
                Adjust in the reporting calendar
              </Link>
            )}
            {year.status === 'planned' && active && (
              <div className="flex flex-wrap gap-1">
                <OpenYear year={year} active={active} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(year.id)}
                >
                  <Pencil aria-hidden="true" />
                  Change
                </Button>
                <DiscardYear year={year} />
              </div>
            )}
            {year.status === 'closed' && (
              <Link
                to="/admin/financial-years/$yearId"
                params={{ yearId: year.id }}
                className={buttonVariants({ variant: 'plain', size: 'sm' })}
              >
                View published results
              </Link>
            )}
          </YearCard>
        ),
      )}

      {planned?.opening && active && (
        <Alert>
          <AlertDescription>
            {planned.opening.ready ? (
              <>
                {active.label} is complete: {planned.opening.published} of{' '}
                {planned.opening.total} institutions have a published result
                {planned.opening.pending.length > 0 &&
                  ' and its evaluation cutoff has passed'}
                . {planned.label} can be opened.
              </>
            ) : (
              <>
                {planned.label} opens once {active.label} is complete.{' '}
                {planned.opening.blocker} Until then {active.label} stays the
                active year, and nothing in it changes.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {data.proposal && !editing && (
        <YearForm
          key={data.proposal.startsOn}
          initial={data.proposal}
          profiles={data.profiles}
          onDone={() => undefined}
        />
      )}

      <section aria-labelledby="year-changes-heading" className="grid gap-3">
        <h2 id="year-changes-heading" className="text-lg font-bold">
          Change log
        </h2>
        {data.changes.length === 0 ? (
          <p className="text-sm text-base-dark">
            No years planned or changed since the platform was set up.
          </p>
        ) : (
          <ul className="grid gap-3">
            {data.changes.map((change) => (
              <li
                key={change.at + change.summary}
                className="rounded-lg border bg-white p-4 text-sm"
              >
                <p className="font-bold">{change.summary}</p>
                <p className="text-base-dark">
                  {formatDateTime(change.at)} by {change.by}. Reason:{' '}
                  {change.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Financial years (HP2-100, PRD §7.1): the active year, and the next one planned ahead. */
export function YearsPage() {
  const years = useQuery(yearsQuery);
  // The deadline rule the proposal used, so the page can say what it applied.
  const calendar = useQuery(calendarQuery);
  const rule = calendar.data?.dayCounting;
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Setup"
        title="Financial years"
        description={`Each financial year has four reporting quarters, their deadlines, a foundation deadline, an evaluation cutoff and a scoring profile. One year is active at a time; plan the next one ahead.${rule ? ` Deadlines are proposed ${rule.reportingDays} ${rule.mode === 'working' ? 'working ' : ''}days after each quarter ends.` : ''}`}
      />
      <QueryView query={years} label="financial years">
        {(data) => <Years data={data} />}
      </QueryView>
    </div>
  );
}
