import type { CalendarSettings, CalendarUpdate } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
});

function LockNote({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
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
    onSuccess: async () => {
      setReason('');
      await queryClient.invalidateQueries();
    },
  });
  const errors = isApiError(save.error) ? save.error.fieldErrors : {};
  const errorFor = (path: string) =>
    errors[path] && <p className="text-sm text-destructive">{errors[path]}</p>;
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

      <fieldset className="grid gap-4 rounded-lg border bg-card p-5">
        <legend className="px-1 font-semibold">Quarterly deadlines</legend>
        <p className="text-sm text-muted-foreground">
          Each deadline ends at 23:59:59 {calendar.timezone} time on the chosen
          date. A deadline is fixed once its quarter opens for reporting, so
          lateness can never be removed by moving it (FR02).
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {calendar.periods.map((period) => (
            <div key={period.id} className="grid content-start gap-1.5">
              <Label htmlFor={`deadline-${period.id}`}>
                {period.label} deadline
              </Label>
              <p className="text-xs text-muted-foreground">
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
              <LockNote reason={period.lock.reason} />
              {errorFor(`deadlines.${period.id}`)}
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border bg-card p-5">
        <legend className="px-1 font-semibold">Other dates</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="foundation-deadline">
              Foundation documents deadline
            </Label>
            <p className="text-xs text-muted-foreground">
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
          <div className="grid content-start gap-1.5">
            <Label htmlFor="evaluation-cutoff">Evaluation cutoff</Label>
            <p className="text-xs text-muted-foreground">
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

      <fieldset className="grid gap-3 rounded-lg border bg-card p-5">
        <legend className="px-1 font-semibold">Reminders</legend>
        <p className="text-sm text-muted-foreground">
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
                {days} {days === 1 ? 'day' : 'days'} before
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

      <div className="grid max-w-2xl gap-1.5">
        <Label htmlFor="calendar-reason">Reason for the change</Label>
        <Textarea
          id="calendar-reason"
          value={reason}
          aria-describedby="calendar-reason-hint"
          onChange={(event) => setReason(event.target.value)}
        />
        <p id="calendar-reason-hint" className="text-sm text-muted-foreground">
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
        {!dirty && (
          <p className="text-sm text-muted-foreground">No changes yet.</p>
        )}
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
            <CalendarForm
              key={JSON.stringify(toUpdate(data))}
              calendar={data}
            />
            <section aria-labelledby="changes-heading">
              <h2 id="changes-heading" className="text-lg font-semibold">
                Change log
              </h2>
              {data.changes.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No changes since the cycle was set up.
                </p>
              ) : (
                <ul className="mt-3 grid gap-3">
                  {data.changes.map((change) => (
                    <li
                      key={change.at + change.summary}
                      className="rounded-lg border bg-card p-4 text-sm"
                    >
                      <p className="font-medium">{change.summary}</p>
                      <p className="text-muted-foreground">
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
