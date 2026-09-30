import type {
  CalendarSettings,
  CalendarUpdate,
  DayCounting,
  DayCountingMode,
} from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useState, type ChangeEvent, type ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { calendarQuery, saveCalendar } from '@/features/settings/queries';
import { isApiError } from '@/lib/api';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';

const reminderOptions = [14, 7, 3, 1];

const toUpdate = (
  calendar: CalendarSettings,
): Omit<CalendarUpdate, 'reason'> => ({
  deadlines: Object.fromEntries(
    calendar.periods.map((period) => [period.id, period.deadlineDate]),
  ),
  foundationDeadlineDate: calendar.foundationDeadlineDate,
  evaluationCutoffDate: calendar.evaluationCutoffDate,
  reminders: structuredClone(calendar.reminders),
  dayCounting: structuredClone(calendar.dayCounting),
  applyRuleToDeadlines: false,
});

const unitLabel = (mode: DayCountingMode, days: number) =>
  `${days} ${mode === 'working' ? 'working ' : ''}${days === 1 ? 'day' : 'days'}`;

/** PRD §9.1 proposes calendar days; the administrator may enforce working days instead. */
function DayCountingFields({
  values,
  onChange,
  errorFor,
}: {
  values: DayCounting;
  onChange: (next: DayCounting) => void;
  errorFor: (path: string) => ReactNode;
}) {
  const [holiday, setHoliday] = useState({ date: '', name: '' });
  const number =
    (
      key:
        | 'reportingDays'
        | 'clarificationDays'
        | 'reviewTargetDays'
        | 'proposalLeadDays',
    ) =>
    (event: ChangeEvent<HTMLInputElement>) =>
      onChange({ ...values, [key]: Number(event.target.value) || 0 });
  return (
    <fieldset className="grid gap-4 rounded-lg border bg-white p-5">
      <legend className="px-1 font-bold">Day counting</legend>
      <p className="text-sm text-base-dark">
        How the cycle counts days for the deadline rule, clarification windows,
        reminders and days late. Working days are Monday to Friday, excluding
        the public holidays below. Windows already issued and deadlines of
        opened quarters never change.
      </p>
      <RadioGroup
        aria-label="Count days as"
        value={values.mode}
        onValueChange={(mode) =>
          onChange({ ...values, mode: mode as DayCountingMode })
        }
        className="grid gap-2 tablet:grid-cols-2"
      >
        {(
          [
            [
              'calendar',
              'Calendar days',
              'Every day counts (PRD §9.1 default).',
            ],
            [
              'working',
              'Working days',
              'Weekends and public holidays are skipped.',
            ],
          ] as const
        ).map(([mode, label, hint]) => (
          <div
            key={mode}
            className="flex items-start gap-2 rounded-md border p-3 has-[button[data-state=checked]]:border-primary"
          >
            <RadioGroupItem id={`mode-${mode}`} value={mode} className="mt-1" />
            <div>
              <Label htmlFor={`mode-${mode}`}>{label}</Label>
              <p className="text-xs text-base-dark">{hint}</p>
            </div>
          </div>
        ))}
      </RadioGroup>
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 widescreen:grid-cols-3">
        <div className="grid content-start gap-2">
          <Label htmlFor="reporting-days">Deadline rule</Label>
          <div className="flex items-center gap-2">
            <Input
              id="reporting-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              className="w-24"
              value={values.reportingDays}
              onChange={number('reportingDays')}
              aria-describedby="reporting-days-hint"
            />
            <span className="text-sm">
              {values.mode === 'working' ? 'working days' : 'days'} after each
              quarter ends
            </span>
          </div>
          <p id="reporting-days-hint" className="text-xs text-base-dark">
            PRD §9.1: 15. Applied to quarters that have not opened when you
            choose to recalculate their deadlines.
          </p>
          {errorFor('dayCounting.reportingDays')}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="clarification-days">Clarification window</Label>
          <div className="flex items-center gap-2">
            <Input
              id="clarification-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              className="w-24"
              value={values.clarificationDays}
              onChange={number('clarificationDays')}
              aria-describedby="clarification-days-hint"
            />
            <span className="text-sm">
              {values.mode === 'working' ? 'working days' : 'days'} to respond
            </span>
          </div>
          <p id="clarification-days-hint" className="text-xs text-base-dark">
            PRD §7.3: 7. Applies to new requests only.
          </p>
          {errorFor('dayCounting.clarificationDays')}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="review-target-days">Officer review target</Label>
          <div className="flex items-center gap-2">
            <Input
              id="review-target-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              className="w-24"
              value={values.reviewTargetDays}
              onChange={number('reviewTargetDays')}
              aria-describedby="review-target-days-hint"
            />
            <span className="text-sm">
              {values.mode === 'working' ? 'working days' : 'days'} from receipt
              to a final decision
            </span>
          </div>
          <p id="review-target-days-hint" className="text-xs text-base-dark">
            A target, not a deadline: later reviews are flagged for supervisors
            and never block finalizing.
          </p>
          {errorFor('dayCounting.reviewTargetDays')}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="proposal-lead-days">Baseline proposals due</Label>
          <div className="flex items-center gap-2">
            <Input
              id="proposal-lead-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              className="w-24"
              value={values.proposalLeadDays}
              onChange={number('proposalLeadDays')}
              aria-describedby="proposal-lead-days-hint"
            />
            <span className="text-sm">
              {values.mode === 'working' ? 'working days' : 'days'} before each
              quarter starts
            </span>
          </div>
          <p id="proposal-lead-days-hint" className="text-xs text-base-dark">
            Leaves the officer time to approve. Institutions see the date on
            their to-do list; supervisors hear of quarters that start
            unapproved.
          </p>
          {errorFor('dayCounting.proposalLeadDays')}
        </div>
      </div>
      <div className="grid gap-2">
        <h3 className="text-sm font-bold">Public holidays</h3>
        <p className="text-xs text-base-dark">
          Used only for working days. The list is a demonstration default;
          confirm it against the Kenya Gazette, including moveable holidays.
        </p>
        {values.holidays.length > 0 && (
          <ul className="grid gap-1 tablet:grid-cols-2">
            {values.holidays.map((day) => (
              <li
                key={day.date}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-bold">
                    {formatCalendarDate(day.date)}
                  </span>{' '}
                  · {day.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...values,
                      holidays: values.holidays.filter(
                        (candidate) => candidate.date !== day.date,
                      ),
                    })
                  }
                >
                  Remove<span className="sr-only"> {day.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-2">
            <Label htmlFor="holiday-date">Date</Label>
            <Input
              id="holiday-date"
              type="date"
              value={holiday.date}
              onChange={(event) =>
                setHoliday({ ...holiday, date: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="holiday-name">Holiday</Label>
            <Input
              id="holiday-name"
              value={holiday.name}
              onChange={(event) =>
                setHoliday({ ...holiday, name: event.target.value })
              }
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={
              !holiday.date ||
              holiday.name.trim().length < 2 ||
              values.holidays.some((day) => day.date === holiday.date)
            }
            onClick={() => {
              onChange({
                ...values,
                holidays: [...values.holidays, holiday].sort((a, b) =>
                  a.date.localeCompare(b.date),
                ),
              });
              setHoliday({ date: '', name: '' });
            }}
          >
            Add holiday
          </Button>
        </div>
        {errorFor('dayCounting.holidays')}
      </div>
    </fieldset>
  );
}

function LockNote({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <p className="flex items-start gap-2 text-xs text-base-dark">
      <Lock className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
      {reason}
    </p>
  );
}

function CalendarForm({ calendar }: { calendar: CalendarSettings }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(() => toUpdate(calendar));
  const [reason, setReason] = useState('');
  const dirty = JSON.stringify(values) !== JSON.stringify(toUpdate(calendar));
  const save = useMutation({
    mutationFn: () => saveCalendar({ ...values, reason }),
    onSuccess: async (next) => {
      // Start from what the server stored (rule deadlines are calculated there).
      setValues(toUpdate(next));
      setReason('');
      queryClient.setQueryData(calendarQuery.queryKey, next);
      await queryClient.invalidateQueries();
    },
  });
  const errors = isApiError(save.error) ? save.error.fieldErrors : {};
  const errorFor = (path: string) =>
    errors[path] && <p className="text-sm text-error-dark">{errors[path]}</p>;
  const toggleReminder = (days: number, on: boolean) =>
    setValues({
      ...values,
      reminders: {
        ...values.reminders,
        daysBefore: on
          ? [...values.reminders.daysBefore, days].sort((a, b) => b - a)
          : values.reminders.daysBefore.filter((value) => value !== days),
      },
    });

  return (
    <form
      className="grid grid-cols-1 gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      {save.isSuccess && !dirty && (
        <Alert>
          <AlertTitle>Calendar saved</AlertTitle>
          <AlertDescription>
            Institutions and officers are notified when a deadline moves.
          </AlertDescription>
        </Alert>
      )}
      {save.isError && (
        <Alert variant="destructive">
          <AlertTitle>The calendar was not saved</AlertTitle>
          <AlertDescription>{save.error.message}</AlertDescription>
        </Alert>
      )}

      <DayCountingFields
        values={values.dayCounting}
        onChange={(dayCounting) => setValues({ ...values, dayCounting })}
        errorFor={errorFor}
      />

      <fieldset className="grid gap-4 rounded-lg border bg-white p-5">
        <legend className="px-1 font-bold">Quarterly deadlines</legend>
        <p className="text-sm text-base-dark">
          Each deadline ends at 23:59:59 {calendar.timezone} time on the chosen
          date. A deadline is fixed once its quarter opens for reporting, so
          lateness can never be removed by moving it (FR02).
        </p>
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 widescreen:grid-cols-4">
          {calendar.periods.map((period) => (
            <div key={period.id} className="grid content-start gap-2">
              <Label htmlFor={`deadline-${period.id}`}>
                {period.label} deadline
              </Label>
              <p className="text-xs text-base-dark">
                Quarter {formatCalendarDate(period.startsOn)} –{' '}
                {formatCalendarDate(period.endsOn)}
              </p>
              <Input
                id={`deadline-${period.id}`}
                type="date"
                value={values.deadlines[period.id] ?? ''}
                disabled={!period.lock.editable}
                onChange={(event) =>
                  setValues({
                    ...values,
                    deadlines: {
                      ...values.deadlines,
                      [period.id]: event.target.value,
                    },
                  })
                }
              />
              {period.lock.editable &&
                calendar.ruleDeadlines[period.id] !==
                  values.deadlines[period.id] && (
                  <p className="text-xs text-base-dark">
                    The saved rule gives{' '}
                    {formatCalendarDate(calendar.ruleDeadlines[period.id]!)}.
                  </p>
                )}
              <LockNote reason={period.lock.reason} />
              {errorFor(`deadlines.${period.id}`)}
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="apply-rule"
            checked={values.applyRuleToDeadlines}
            onCheckedChange={(checked) =>
              setValues({ ...values, applyRuleToDeadlines: checked === true })
            }
            className="mt-1"
          />
          <div>
            <Label htmlFor="apply-rule" className="font-normal">
              When saving, set the deadlines of quarters that have not opened
              from the rule:{' '}
              {unitLabel(
                values.dayCounting.mode,
                values.dayCounting.reportingDays,
              )}{' '}
              after quarter end
            </Label>
            <p className="text-xs text-base-dark">
              The dates are calculated on the server when you save; the dates
              above are then ignored for those quarters.
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border bg-white p-5">
        <legend className="px-1 font-bold">Other dates</legend>
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="foundation-deadline">
              Foundation documents deadline
            </Label>
            <p className="text-xs text-base-dark">
              Procedures, risk assessment and mitigation plan; separate from
              quarterly deadlines.
            </p>
            <Input
              id="foundation-deadline"
              type="date"
              value={values.foundationDeadlineDate}
              disabled={!calendar.foundationLock.editable}
              onChange={(event) =>
                setValues({
                  ...values,
                  foundationDeadlineDate: event.target.value,
                })
              }
            />
            <LockNote reason={calendar.foundationLock.reason} />
            {errorFor('foundationDeadlineDate')}
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="evaluation-cutoff">Evaluation cutoff</Label>
            <p className="text-xs text-base-dark">
              A demonstration setting, not an official EACC deadline. It must
              fall after the Q4 deadline.
            </p>
            <Input
              id="evaluation-cutoff"
              type="date"
              value={values.evaluationCutoffDate}
              disabled={!calendar.cutoffLock.editable}
              onChange={(event) =>
                setValues({
                  ...values,
                  evaluationCutoffDate: event.target.value,
                })
              }
            />
            <LockNote reason={calendar.cutoffLock.reason} />
            {errorFor('evaluationCutoffDate')}
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border bg-white p-5">
        <legend className="px-1 font-bold">Reminders</legend>
        <p className="text-sm text-base-dark">
          Sent to institutions that have not yet submitted. Changes apply to
          reminders still to come; past reminders are never sent late.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {reminderOptions.map((days) => (
            <div key={days} className="flex items-center gap-2">
              <Checkbox
                id={`reminder-${days}`}
                checked={values.reminders.daysBefore.includes(days)}
                onCheckedChange={(checked) =>
                  toggleReminder(days, checked === true)
                }
              />
              <Label htmlFor={`reminder-${days}`} className="font-normal">
                {unitLabel(values.dayCounting.mode, days)} before
              </Label>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Checkbox
              id="reminder-overdue"
              checked={values.reminders.overdueNotice}
              onCheckedChange={(checked) =>
                setValues({
                  ...values,
                  reminders: {
                    ...values.reminders,
                    overdueNotice: checked === true,
                  },
                })
              }
            />
            <Label htmlFor="reminder-overdue" className="font-normal">
              Once when overdue (institution and officer)
            </Label>
          </div>
        </div>
      </fieldset>

      <div className="grid max-w-measure gap-2">
        <Label htmlFor="calendar-reason">Reason for the change</Label>
        <Textarea
          id="calendar-reason"
          value={reason}
          aria-describedby="calendar-reason-hint"
          onChange={(event) => setReason(event.target.value)}
        />
        <p id="calendar-reason-hint" className="text-sm text-base-dark">
          At least 10 characters. Kept in the change log and the audit log, and
          included in the notice to institutions.
        </p>
        {errorFor('reason')}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={!dirty || reason.trim().length < 10 || save.isPending}
        >
          {save.isPending ? 'Saving…' : 'Save calendar'}
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setValues(toUpdate(calendar))}
          >
            Discard changes
          </Button>
        )}
        {!dirty && <p className="text-sm text-base-dark">No changes yet.</p>}
      </div>
    </form>
  );
}

export function CalendarPage() {
  const calendar = useQuery(calendarQuery);
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Setup"
        title="Reporting calendar"
        description={
          calendar.data
            ? `${calendar.data.label} · ${calendar.data.timezone}. Deadlines, the evaluation cutoff and reminders for this cycle.`
            : 'Deadlines, the evaluation cutoff and reminders for this cycle.'
        }
      />
      <QueryView query={calendar} label="reporting calendar">
        {(data) => (
          <div className="grid grid-cols-1 gap-8">
            <CalendarForm calendar={data} />
            <section aria-labelledby="changes-heading">
              <h2 id="changes-heading" className="text-lg font-bold">
                Change log
              </h2>
              {data.changes.length === 0 ? (
                <p className="mt-2 text-sm text-base-dark">
                  No changes since the cycle was set up.
                </p>
              ) : (
                <ul className="mt-3 grid gap-3">
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
        )}
      </QueryView>
    </div>
  );
}
