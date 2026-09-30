import {
  planImportColumns,
  type Activity,
  type BaselineProposal,
  type Plan,
  type PlannedMilestone,
  type Risk,
  type RiskScale,
} from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Plus, Send, Trash2, Upload } from 'lucide-react';
import {
  cloneElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { SelectField } from '@/components/select-field';
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
import { invalidateEvents } from '@/features/events/queries';
import { FileViewer } from '@/features/files/file-viewer';
import { cycleQuery } from '@/features/directory/queries';
import { foundationsQuery } from '@/features/foundations/queries';
import { scalePoint } from '@/features/planning/labels';
import {
  importPlan,
  invalidatePlan,
  previewPlanImport,
  proposeBaseline,
  removePlanItem,
  savePlanApproval,
  savePlanItem,
  type PlanCollection,
} from '@/features/planning/queries';
import { isApiError } from '@/lib/api';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';

/**
 * Editing the institution's own plan (FR04): the approval record, risks, activities and each
 * quarter's milestones, and proposing a quarter's baseline to the officer.
 */

function usePlanChange<T, R>(
  institutionId: string,
  action: (value: T) => Promise<R>,
  onDone?: () => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async () => {
      await Promise.all([
        invalidatePlan(queryClient, institutionId),
        invalidateEvents(queryClient),
      ]);
      onDone?.();
    },
  });
}

const count = (value: number, one: string, many: string) =>
  `${value} ${value === 1 ? one : many}`;

const fieldErrorsOf = (error: unknown) =>
  isApiError(error) ? error.fieldErrors : {};

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
  children: ReactElement<Record<string, unknown>>;
}) {
  const describedBy =
    [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') ||
    undefined;
  // The hint and error are read with the control; SelectField takes them as props.
  const control =
    children.type === SelectField
      ? cloneElement(children, { describedBy, invalid: Boolean(error) })
      : cloneElement(children, {
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : undefined,
        });
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-base-dark">
          {hint}
        </p>
      )}
      {control}
      {error && (
        <p id={`${id}-error`} className="text-sm text-error-dark">
          {error}
        </p>
      )}
    </div>
  );
}

/** A form error not already shown beside a field. */
function FormError({ error, fields }: { error: unknown; fields: string[] }) {
  if (!error) return null;
  const shown = Object.keys(fieldErrorsOf(error)).some((key) =>
    fields.includes(key),
  );
  return (
    <p role="alert" className="text-sm text-error-dark">
      {shown
        ? 'Some values need attention.'
        : error instanceof Error
          ? error.message
          : 'The change could not be saved.'}
    </p>
  );
}

/** A dialog holding one form; the form is rebuilt each time the dialog opens. */
function FormDialog({
  title,
  description,
  trigger,
  wide,
  children,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  wide?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={`${wide ? 'tablet:max-w-measure' : 'tablet:max-w-mobile-lg'}`}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open && children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  );
}

function useFields<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState(initial);
  const bind = (key: keyof T & string) => ({
    value: values[key],
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setValues((current) => ({ ...current, [key]: event.target.value })),
  });
  const set = (key: keyof T & string) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  return { values, bind, set };
}

const scaleOptions = (
  scale: RiskScale | undefined,
  axis: 'probability' | 'impact',
) =>
  [1, 2, 3, 4, 5].map((value) => ({
    value: String(value),
    label: scalePoint(scale, axis, value),
  }));

function RiskForm({
  plan,
  risk,
  close,
}: {
  plan: Plan;
  risk?: Risk;
  close: () => void;
}) {
  const id = useId();
  const riskScale = useQuery(cycleQuery).data?.riskScale;
  const { values, bind, set } = useFields({
    code: risk?.code ?? '',
    description: risk?.description ?? '',
    cause: risk?.cause ?? '',
    probability: String(risk?.probability ?? ''),
    impact: String(risk?.impact ?? ''),
  });
  const save = usePlanChange(
    plan.institutionId,
    () =>
      savePlanItem(plan.institutionId, 'risks', risk?.id ?? null, {
        ...values,
        probability: Number(values.probability),
        impact: Number(values.impact),
      }),
    close,
  );
  const errors = fieldErrorsOf(save.error);
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(undefined);
      }}
    >
      <Field
        id={`${id}-code`}
        label="Code"
        hint="For example R-03."
        error={errors.code}
      >
        <Input id={`${id}-code`} className="max-w-32" {...bind('code')} />
      </Field>
      <Field id={`${id}-description`} label="Risk" error={errors.description}>
        <Input id={`${id}-description`} {...bind('description')} />
      </Field>
      <Field id={`${id}-cause`} label="Cause" error={errors.cause}>
        <Textarea id={`${id}-cause`} {...bind('cause')} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field
          id={`${id}-probability`}
          label="Probability (1–5)"
          hint="How likely the risk is to occur."
          error={errors.probability}
        >
          <SelectField
            id={`${id}-probability`}
            value={values.probability}
            onChange={set('probability')}
            placeholder="Choose"
            options={scaleOptions(riskScale, 'probability')}
          />
        </Field>
        <Field
          id={`${id}-impact`}
          label="Impact (1–5)"
          hint="How serious it would be if it occurred."
          error={errors.impact}
        >
          <SelectField
            id={`${id}-impact`}
            value={values.impact}
            onChange={set('impact')}
            placeholder="Choose"
            options={scaleOptions(riskScale, 'impact')}
          />
        </Field>
      </div>
      {riskScale && (
        <p className="text-xs text-base-dark">
          Scale labels: {riskScale.source} Severity is probability × impact,
          with no rating bands.
        </p>
      )}
      <FormError error={save.error} fields={Object.keys(values)} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {risk ? 'Save risk' : 'Add risk'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ActivityForm({
  plan,
  activity,
  close,
}: {
  plan: Plan;
  activity?: Activity;
  close: () => void;
}) {
  const id = useId();
  const { values, bind, set } = useFields({
    code: activity?.code ?? '',
    riskId: activity?.riskId ?? '',
    title: activity?.title ?? '',
    strategy: activity?.strategy ?? '',
    output: activity?.output ?? '',
    kpi: activity?.kpi ?? '',
    target: activity?.target ?? '',
    owner: activity?.owner ?? '',
    resourceReference: activity?.resourceReference ?? '',
  });
  const save = usePlanChange(
    plan.institutionId,
    () =>
      savePlanItem(
        plan.institutionId,
        'activities',
        activity?.id ?? null,
        values,
      ),
    close,
  );
  const errors = fieldErrorsOf(save.error);
  const text = (
    key: keyof typeof values & string,
    label: string,
    hint?: string,
  ) => (
    <Field id={`${id}-${key}`} label={label} hint={hint} error={errors[key]}>
      <Input id={`${id}-${key}`} {...bind(key)} />
    </Field>
  );
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(undefined);
      }}
    >
      <div className="grid gap-4 tablet:grid-cols-[8rem_1fr]">
        {text('code', 'Code', 'For example A-04.')}
        <Field id={`${id}-risk`} label="Risk treated" error={errors.riskId}>
          <SelectField
            id={`${id}-risk`}
            value={values.riskId}
            onChange={set('riskId')}
            placeholder="Choose a risk"
            options={plan.risks.map((risk) => ({
              value: risk.id,
              label: `${risk.code} ${risk.description}`,
            }))}
          />
        </Field>
      </div>
      {text('title', 'Activity')}
      <Field id={`${id}-strategy`} label="Strategy" error={errors.strategy}>
        <Textarea id={`${id}-strategy`} {...bind('strategy')} />
      </Field>
      <div className="grid gap-4 tablet:grid-cols-2">
        {text('output', 'Output')}
        {text('kpi', 'Key performance indicator')}
        {text('target', 'Target')}
        {text('owner', 'Responsible')}
      </div>
      {text(
        'resourceReference',
        'Resources (optional)',
        'Budget line or other resource reference.',
      )}
      <FormError error={save.error} fields={Object.keys(values)} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {activity ? 'Save activity' : 'Add activity'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function MilestoneForm({
  plan,
  milestone,
  periodId,
  close,
}: {
  plan: Plan;
  milestone?: PlannedMilestone;
  periodId: string;
  close: () => void;
}) {
  const id = useId();
  const { values, bind, set } = useFields({
    code: milestone?.code ?? '',
    activityId: milestone?.activityId ?? '',
    periodId: milestone?.periodId ?? periodId,
    title: milestone?.title ?? '',
    completionCondition: milestone?.completionCondition ?? '',
    evidenceExpectation: milestone?.evidenceExpectation ?? '',
  });
  const save = usePlanChange(
    plan.institutionId,
    () =>
      savePlanItem(
        plan.institutionId,
        'plan-milestones',
        milestone?.id ?? null,
        values,
      ),
    close,
  );
  const errors = fieldErrorsOf(save.error);
  const quarters = plan.proposals.filter(
    (proposal) => !proposal.locked && proposal.status !== 'approved',
  );
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(undefined);
      }}
    >
      <div className="grid gap-4 tablet:grid-cols-[8rem_1fr]">
        <Field
          id={`${id}-code`}
          label="Code"
          hint="For example M-13."
          error={errors.code}
        >
          <Input id={`${id}-code`} {...bind('code')} />
        </Field>
        <Field id={`${id}-quarter`} label="Quarter" error={errors.periodId}>
          <SelectField
            id={`${id}-quarter`}
            value={values.periodId}
            onChange={set('periodId')}
            options={quarters.map((proposal) => ({
              value: proposal.periodId,
              label: proposal.periodLabel,
            }))}
          />
        </Field>
      </div>
      <Field id={`${id}-activity`} label="Activity" error={errors.activityId}>
        <SelectField
          id={`${id}-activity`}
          value={values.activityId}
          onChange={set('activityId')}
          placeholder="Choose an activity"
          options={plan.activities.map((activity) => ({
            value: activity.id,
            label: `${activity.code} ${activity.title}`,
          }))}
        />
      </Field>
      <Field id={`${id}-title`} label="Milestone" error={errors.title}>
        <Input id={`${id}-title`} {...bind('title')} />
      </Field>
      <Field
        id={`${id}-condition`}
        label="Completion condition"
        hint="What an officer can check objectively at quarter end."
        error={errors.completionCondition}
      >
        <Textarea id={`${id}-condition`} {...bind('completionCondition')} />
      </Field>
      <Field
        id={`${id}-evidence`}
        label="Evidence expected"
        hint="For example signed minutes or a progress report passage."
        error={errors.evidenceExpectation}
      >
        <Input id={`${id}-evidence`} {...bind('evidenceExpectation')} />
      </Field>
      <FormError error={save.error} fields={Object.keys(values)} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {milestone ? 'Save milestone' : 'Add milestone'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RiskDialog({ plan, risk }: { plan: Plan; risk?: Risk }) {
  return (
    <FormDialog
      title={risk ? `Edit ${risk.code}` : 'Add a risk'}
      description="Rate probability and impact on the cycle’s 1–5 scale, as in your risk assessment."
      trigger={
        risk ? (
          <Button variant="ghost" size="sm" aria-label={`Edit ${risk.code}`}>
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus aria-hidden="true" />
            Add risk
          </Button>
        )
      }
    >
      {(close) => <RiskForm plan={plan} risk={risk} close={close} />}
    </FormDialog>
  );
}

export function ActivityDialog({
  plan,
  activity,
}: {
  plan: Plan;
  activity?: Activity;
}) {
  return (
    <FormDialog
      wide
      title={activity ? `Edit ${activity.code}` : 'Add an activity'}
      description="A mitigation activity from your plan, with the risk it treats and how its progress is measured."
      trigger={
        activity ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${activity.code}`}
          >
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={!plan.risks.length}>
            <Plus aria-hidden="true" />
            Add activity
          </Button>
        )
      }
    >
      {(close) => (
        <ActivityForm plan={plan} activity={activity} close={close} />
      )}
    </FormDialog>
  );
}

export function MilestoneDialog({
  plan,
  milestone,
  proposal,
}: {
  plan: Plan;
  milestone?: PlannedMilestone;
  proposal: BaselineProposal;
}) {
  return (
    <FormDialog
      wide
      title={
        milestone
          ? `Edit ${milestone.code}`
          : `Add a ${proposal.periodLabel} milestone`
      }
      description="Each milestone belongs to an activity, and has a completion condition your officer can check at quarter end."
      trigger={
        milestone ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${milestone.code}`}
          >
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={!plan.activities.length}
          >
            <Plus aria-hidden="true" />
            Add {proposal.periodLabel} milestone
          </Button>
        )
      }
    >
      {(close) => (
        <MilestoneForm
          plan={plan}
          milestone={milestone}
          periodId={proposal.periodId}
          close={close}
        />
      )}
    </FormDialog>
  );
}

export function RemovePlanItem({
  plan,
  collection,
  id,
  code,
}: {
  plan: Plan;
  collection: PlanCollection;
  id: string;
  code: string;
}) {
  const [open, setOpen] = useState(false);
  const remove = usePlanChange(
    plan.institutionId,
    () => removePlanItem(plan.institutionId, collection, id),
    () => setOpen(false),
  );
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Remove ${code}`}>
          <Trash2 aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {code}?</AlertDialogTitle>
          <AlertDialogDescription>
            It is removed from your plan. Baselines already proposed or approved
            keep their own copy.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && (
          <p role="alert" className="text-sm text-error-dark">
            {remove.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              remove.mutate(undefined);
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ApprovalForm({ plan, close }: { plan: Plan; close: () => void }) {
  const id = useId();
  const foundations = useQuery(foundationsQuery(plan.institutionId));
  const versions =
    foundations.data?.indicators
      .find((indicator) => indicator.kind === 'mitigation_plan')
      ?.versions.filter((version) => version.status !== 'withdrawn') ?? [];
  const { values, bind, set } = useFields({
    approvingBody: plan.approval?.approvingBody ?? '',
    approvedOn: plan.approval?.approvedOn ?? '',
    reference: plan.approval?.reference ?? '',
    accountingOfficer: plan.approval?.accountingOfficer ?? '',
    documentVersionId: plan.approval?.documentVersionId ?? '',
  });
  const save = usePlanChange(
    plan.institutionId,
    () =>
      savePlanApproval(plan.institutionId, {
        ...values,
        documentVersionId: values.documentVersionId || null,
      }),
    close,
  );
  const errors = fieldErrorsOf(save.error);
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(undefined);
      }}
    >
      <Field
        id={`${id}-body`}
        label="Approved by"
        hint="The body that approved the plan, such as the Board or the Corruption Prevention Committee."
        error={errors.approvingBody}
      >
        <Input id={`${id}-body`} {...bind('approvingBody')} />
      </Field>
      <div className="grid gap-4 tablet:grid-cols-2">
        <Field
          id={`${id}-date`}
          label="Approval date"
          error={errors.approvedOn}
        >
          <Input id={`${id}-date`} type="date" {...bind('approvedOn')} />
        </Field>
        <Field
          id={`${id}-reference`}
          label="Resolution or minutes reference"
          error={errors.reference}
        >
          <Input id={`${id}-reference`} {...bind('reference')} />
        </Field>
      </div>
      <Field
        id={`${id}-ao`}
        label="Accounting Officer"
        error={errors.accountingOfficer}
      >
        <Input id={`${id}-ao`} {...bind('accountingOfficer')} />
      </Field>
      <Field
        id={`${id}-document`}
        label="Mitigation plan document"
        hint="The version under Foundation documents that this approval covers."
        error={errors.documentVersionId}
      >
        <SelectField
          id={`${id}-document`}
          value={values.documentVersionId}
          onChange={set('documentVersionId')}
          placeholder={
            versions.length ? 'Choose a version' : 'No mitigation plan uploaded'
          }
          disabled={!versions.length}
          options={versions.map((version) => ({
            value: version.id,
            label: `Version ${version.version}: ${version.evidence.fileName}`,
          }))}
        />
      </Field>
      <FormError error={save.error} fields={Object.keys(values)} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          Save approval record
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Who approved the plan, and the document version the approval covers. */
export function PlanApprovalRecord({ plan }: { plan: Plan }) {
  const foundations = useQuery({
    ...foundationsQuery(plan.institutionId),
    enabled: Boolean(plan.approval?.documentVersionId),
  });
  const document = foundations.data?.indicators
    .flatMap((indicator) => indicator.versions)
    .find((version) => version.id === plan.approval?.documentVersionId);
  const { approval } = plan;
  return (
    <section
      aria-labelledby="approval-heading"
      className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="approval-heading" className="text-lg font-bold">
            Plan approval
          </h2>
          <p className="text-sm text-base-dark">
            Your Corruption Risk Assessment and Mitigation Plan, as approved
            within the institution.
          </p>
        </div>
        {plan.editable && (
          <FormDialog
            wide
            title="Plan approval record"
            description="Record who approved your plan and when. Your officer reads baselines against it."
            trigger={
              <Button variant="outline" size="sm">
                <Pencil aria-hidden="true" />
                {approval ? 'Edit' : 'Record approval'}
              </Button>
            }
          >
            {(close) => <ApprovalForm plan={plan} close={close} />}
          </FormDialog>
        )}
      </div>
      {approval ? (
        <dl className="grid gap-x-6 gap-y-2 text-sm tablet:grid-cols-[12rem_1fr]">
          <dt className="text-base-dark">Approved by</dt>
          <dd>
            {approval.approvingBody}, {formatCalendarDate(approval.approvedOn)}
          </dd>
          <dt className="text-base-dark">Reference</dt>
          <dd>{approval.reference}</dd>
          <dt className="text-base-dark">Accounting Officer</dt>
          <dd>{approval.accountingOfficer || 'Not recorded'}</dd>
          <dt className="text-base-dark">Plan document</dt>
          <dd>
            {document ? (
              <>
                Version {document.version}:{' '}
                <FileViewer file={document.evidence} />
              </>
            ) : approval.documentVersionId ? (
              'Linked version'
            ) : (
              'Not linked'
            )}
          </dd>
          <dt className="text-base-dark">Recorded</dt>
          <dd>
            {approval.recordedBy}, {formatDateTime(approval.recordedAt)}
          </dd>
        </dl>
      ) : (
        <p className="text-sm">
          No approval is recorded yet.{' '}
          {plan.editable
            ? 'Record who approved your plan before proposing baselines.'
            : 'The institution has not recorded its plan approval.'}
        </p>
      )}
    </section>
  );
}

/** Activities and the risk each one treats, with how progress is measured. */
export function ActivityTable({
  plan,
  actions,
}: {
  plan: Plan;
  actions?: (activity: Activity) => ReactNode;
}) {
  if (!plan.activities.length)
    return (
      <p className="rounded-lg border bg-white p-4 text-sm text-base-dark">
        No activities yet.
        {plan.editable &&
          ' Add the mitigation activities from your plan, each linked to the risk it treats.'}
      </p>
    );
  const riskOf = new Map(plan.risks.map((risk) => [risk.id, risk]));
  return (
    <div className="rounded-lg border bg-white">
      <Table className="min-w-[48rem]">
        <TableCaption className="sr-only">
          Mitigation activities and the risks they treat
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Activity</TableHead>
            <TableHead scope="col">Risk treated</TableHead>
            <TableHead scope="col">Output, KPI and target</TableHead>
            <TableHead scope="col">Responsible</TableHead>
            {actions && (
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {plan.activities.map((activity) => (
            <TableRow key={activity.id}>
              <TableHead
                scope="row"
                className="h-auto py-2 font-normal whitespace-normal"
              >
                <span className="font-bold">{activity.code}</span>{' '}
                {activity.title}
                <span className="block text-xs text-base-dark">
                  {activity.strategy}
                </span>
              </TableHead>
              <TableCell className="text-sm whitespace-normal">
                {riskOf.get(activity.riskId)?.code ?? '—'}
              </TableCell>
              <TableCell className="text-sm whitespace-normal">
                {activity.output}
                <span className="block text-xs text-base-dark">
                  {activity.kpi}: {activity.target}
                </span>
              </TableCell>
              <TableCell className="text-sm whitespace-normal">
                {activity.owner}
                {activity.resourceReference && (
                  <span className="block text-xs text-base-dark">
                    {activity.resourceReference}
                  </span>
                )}
              </TableCell>
              {actions && (
                <TableCell className="text-right whitespace-nowrap">
                  {actions(activity)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ProposeDialog({
  plan,
  proposal,
}: {
  plan: Plan;
  proposal: BaselineProposal;
}) {
  const id = useId();
  return (
    <FormDialog
      title={`Propose the ${proposal.periodLabel} baseline`}
      description={`Your officer receives the ${proposal.plannedMilestones} planned ${proposal.plannedMilestones === 1 ? 'milestone' : 'milestones'} with the quarter’s CPC and IAO meetings, and approves or returns them.`}
      trigger={
        <Button size="sm" disabled={!proposal.plannedMilestones}>
          <Send aria-hidden="true" />
          {proposal.status === 'not_proposed'
            ? `Propose ${proposal.periodLabel} baseline`
            : `Propose ${proposal.periodLabel} again`}
        </Button>
      }
    >
      {(close) => (
        <ProposeForm plan={plan} proposal={proposal} id={id} close={close} />
      )}
    </FormDialog>
  );
}

function ProposeForm({
  plan,
  proposal,
  id,
  close,
}: {
  plan: Plan;
  proposal: BaselineProposal;
  id: string;
  close: () => void;
}) {
  const [note, setNote] = useState('');
  const propose = usePlanChange(
    plan.institutionId,
    () => proposeBaseline(plan.institutionId, proposal.periodId, note),
    close,
  );
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        propose.mutate(undefined);
      }}
    >
      <Field
        id={`${id}-note`}
        label="Note to your officer (optional)"
        hint={
          proposal.status === 'returned'
            ? 'Say what you changed after the return.'
            : undefined
        }
      >
        <Textarea
          id={`${id}-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <FormError error={propose.error} fields={[]} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={propose.isPending}>
          Send for approval
        </Button>
      </DialogFooter>
    </form>
  );
}

const template = [
  planImportColumns.join(','),
  'risk,R-03,,,Collusion in debt settlement,One officer negotiates and approves,3,5,,,,,,,,',
  'activity,A-04,R-03,,Separate negotiation from approval,,,,Segregate duties,Revised procedure,Settlements with a second approval,100% from Q3,Head of debt management,Recurrent budget,,',
  'milestone,M-13,A-04,Q3,Settlement procedure revised,,,,,,,,,,The revised procedure was approved and circulated by quarter end.,CPC minutes',
].join('\r\n');

function downloadTemplate() {
  const url = URL.createObjectURL(
    new Blob([`${template}\r\n`], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'plan-template.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Loads risks, activities and milestones from one CSV after a row-by-row check. */
export function ImportPlanDialog({ plan }: { plan: Plan }) {
  const id = useId();
  const riskScale = useQuery(cycleQuery).data?.riskScale;
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const preview = useMutation({
    mutationFn: (text: string) => previewPlanImport(plan.institutionId, text),
  });
  const run = usePlanChange(plan.institutionId, () =>
    importPlan(plan.institutionId, csv!.text),
  );
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
        <Button variant="outline" size="sm">
          <Upload aria-hidden="true" />
          Import from CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="tablet:max-w-measure">
        <DialogHeader>
          <DialogTitle>Import your plan</DialogTitle>
          <DialogDescription>
            Rows are matched to your plan by code, so a file can add and update.
            Nothing changes unless every row is ready.
          </DialogDescription>
        </DialogHeader>
        {run.isSuccess ? (
          <div className="grid gap-3">
            <p role="status" className="font-bold">
              Imported {count(run.data.risks, 'risk', 'risks')},{' '}
              {count(run.data.activities, 'activity', 'activities')} and{' '}
              {count(run.data.milestones, 'milestone', 'milestones')}.
            </p>
            <p className="text-sm text-base-dark">
              Propose each quarter’s baseline when its milestones are ready.
            </p>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1 text-sm">
              <p>
                One row per risk, activity or milestone, named in the{' '}
                <code className="text-xs">record</code> column. An activity’s{' '}
                <code className="text-xs">link</code> is its risk code; a
                milestone’s is its activity code, with a{' '}
                <code className="text-xs">quarter</code> from Q1 to Q4.
                Milestones can only go into quarters not yet approved.
              </p>
              {riskScale && (
                <p>
                  <code className="text-xs">probability</code> and{' '}
                  <code className="text-xs">impact</code> are numbers from 1 to
                  5. Probability:{' '}
                  {riskScale.probability
                    .map((label, index) => `${index + 1} ${label}`)
                    .join(', ')}
                  . Impact:{' '}
                  {riskScale.impact
                    .map((label, index) => `${index + 1} ${label}`)
                    .join(', ')}
                  .
                </p>
              )}
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
                {result.rows.length > 0 && (
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
                          <TableHead scope="col">Row</TableHead>
                          <TableHead scope="col">Check</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          ...result.rows.filter((row) => row.errors.length),
                          ...result.rows.filter((row) => !row.errors.length),
                        ].map((row) => (
                          <TableRow key={row.line}>
                            <TableCell>{row.line}</TableCell>
                            <TableHead
                              scope="row"
                              className="font-normal whitespace-normal"
                            >
                              <span className="block font-bold">
                                {row.code || '—'}{' '}
                                <span className="font-normal text-base-dark">
                                  {row.record}
                                </span>
                              </span>
                              <span className="block text-xs text-base-dark">
                                {row.title}
                              </span>
                            </TableHead>
                            <TableCell className="text-sm whitespace-normal">
                              {row.errors.length ? (
                                <ul className="list-disc pl-4 text-error-dark">
                                  {row.errors.map((error) => (
                                    <li key={error}>{error}</li>
                                  ))}
                                </ul>
                              ) : row.action === 'update' ? (
                                'Ready: updates the plan'
                              ) : (
                                'Ready: adds to the plan'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
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
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!ready || run.isPending}
                onClick={() => run.mutate(undefined)}
              >
                {run.isPending
                  ? 'Importing…'
                  : ready
                    ? `Import ${result.valid} ${result.valid === 1 ? 'row' : 'rows'}`
                    : 'Import'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
