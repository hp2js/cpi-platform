import { isEvidenceAnswer } from '@cpi/contracts';
import type {
  AccountingOfficer,
  Attestation,
  Completeness,
  ReportBundle,
} from '@cpi/contracts';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  FileText,
  Send,
} from 'lucide-react';
import { useRef } from 'react';
import { Glossary } from '@/components/glossary';
import { PageHeader } from '@/components/page-header';
import { ErrorSummary } from '@/components/error-summary';
import { answerChanges } from '@/features/reporting/changes';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  evidenceCategoryLabel,
  fieldDomId,
  formatBytes,
} from '@/features/reporting/answers';
import {
  completenessQuery,
  invalidateReport,
  obligationIdFor,
  reportKeys,
  reportQuery,
  submitReport,
} from '@/features/reporting/queries';
import { institutionQuery } from '@/features/directory/queries';
import { useSession } from '@/features/session/use-session';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { FileViewer } from '@/features/files/file-viewer';

const route = getRouteApi('/authed/institution/reports/$periodId/review');

function referencedIds(bundle: ReportBundle) {
  const answers = bundle.draft?.answers;
  if (!answers) return [];
  const ids = new Set<string>();
  for (const value of Object.values(answers.questions))
    if (isEvidenceAnswer(value)) value.evidenceIds.forEach((id) => ids.add(id));
  for (const response of Object.values(answers.milestones))
    response.evidence.forEach((reference) => ids.add(reference.evidenceId));
  return [...ids];
}

function Checklist({
  completeness,
  periodId,
}: {
  completeness: Completeness;
  periodId: string;
}) {
  return (
    <div className="grid gap-4">
      {completeness.missing.length > 0 ? (
        <section
          aria-labelledby="missing-heading"
          className="border-l-8 border-error bg-error-lighter px-5 py-4"
        >
          <h2
            id="missing-heading"
            className="flex items-center gap-2 text-md font-bold"
          >
            <CircleAlert className="size-6 shrink-0" aria-hidden="true" />
            {completeness.missing.length} item
            {completeness.missing.length === 1 ? '' : 's'} to complete before
            you can submit
          </h2>
          <ul className="mt-3 grid gap-2 pl-8 text-sm">
            {completeness.missing.map((item) => (
              <li key={`${item.field}-${item.message}`}>
                <Link
                  to="/institution/reports/$periodId"
                  params={{ periodId }}
                  hash={fieldDomId(item.field)}
                  className="font-bold text-error-dark underline underline-offset-2"
                >
                  {item.label}
                </Link>
                : {item.message}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section
          aria-labelledby="ready-heading"
          className="border-l-8 border-success bg-success-lighter px-5 py-4"
        >
          <h2
            id="ready-heading"
            className="flex items-center gap-2 text-md font-bold"
          >
            <CircleCheck className="size-6 shrink-0" aria-hidden="true" />
            Every required item is answered
          </h2>
          <p className="mt-1 pl-8 text-sm">
            Check the declarations below, then confirm your authority to submit.
          </p>
        </section>
      )}
      {completeness.declarations.length > 0 && (
        <section
          aria-labelledby="declarations-heading"
          className="rounded-lg border bg-white p-5"
        >
          <h2 id="declarations-heading" className="font-bold">
            Declarations you are making
          </h2>
          <p className="mt-1 text-sm text-base-dark">
            These are honest statements, not errors. They are recorded on your
            receipt and considered by the reviewing officer.
          </p>
          <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm">
            {completeness.declarations.map((item) => (
              <li key={`${item.field}-${item.message}`}>
                <span className="font-bold">{item.label}</span>: {item.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Before a clarification response is submitted, what it changes compared with the last
 * submitted revision, so the focal person can confirm the answer addresses the question.
 */
function ChangesSinceSubmitted({
  bundle,
  periodId,
}: {
  bundle: ReportBundle;
  periodId: string;
}) {
  if (!bundle.submitted || !bundle.draft || !bundle.form) return null;
  const changes = answerChanges(
    bundle.form,
    bundle.baseline.milestones,
    bundle.evidence,
    bundle.submitted.answers,
    bundle.draft.answers,
  );
  const revision = bundle.submitted.revision;
  return (
    <section
      aria-labelledby="changes-heading"
      className="rounded-lg border border-base-lighter bg-white p-5"
    >
      <h2 id="changes-heading" className="font-bold">
        What you changed since revision {revision}
      </h2>
      {changes.length === 0 ? (
        <p className="mt-2 flex items-start gap-2 bg-warning-lighter px-3 py-2 text-sm">
          <CircleAlert
            className="mt-1 size-4 shrink-0 text-warning-darker"
            aria-hidden="true"
          />
          Nothing yet. Submitting now sends the same answers as revision{' '}
          {revision}; change what the clarification asks about first.
        </p>
      ) : (
        <Table className="mt-3">
          <TableCaption className="sr-only">
            Answers changed since revision {revision}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Answer</TableHead>
              <TableHead scope="col">Revision {revision}</TableHead>
              <TableHead scope="col">Now</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.map((change) => (
              <TableRow key={change.field}>
                <TableHead
                  scope="row"
                  className="font-normal whitespace-normal"
                >
                  <Link
                    to="/institution/reports/$periodId"
                    params={{ periodId }}
                    hash={change.field}
                    className="usa-link"
                  >
                    {change.label}
                  </Link>
                </TableHead>
                <TableCell className="whitespace-normal text-base-dark">
                  {change.before}
                </TableCell>
                <TableCell className="whitespace-normal font-bold">
                  {change.after}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function ClaimsSummary({ bundle }: { bundle: ReportBundle }) {
  const answers = bundle.draft?.answers;
  const attached = bundle.evidence.filter((item) =>
    referencedIds(bundle).includes(item.id),
  );
  return (
    <div className="grid gap-4 desktop:grid-cols-2">
      <section
        aria-labelledby="claims-heading"
        className="rounded-lg border bg-white p-5"
      >
        <h2 id="claims-heading" className="font-bold">
          Milestone claims
        </h2>
        <ul className="mt-3 grid gap-2 text-sm">
          {bundle.baseline.milestones.map((milestone) => {
            const response = answers?.milestones[milestone.id];
            return (
              <li key={milestone.id} className="flex justify-between gap-3">
                <span>
                  <span className="font-bold">{milestone.code}</span>{' '}
                  {milestone.title}
                </span>
                <span className="shrink-0 text-base-dark">
                  {response?.completed === true
                    ? 'Completed'
                    : response?.completed === false
                      ? 'Not completed'
                      : 'Not answered'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <section
        aria-labelledby="files-heading"
        className="rounded-lg border bg-white p-5"
      >
        <h2 id="files-heading" className="font-bold">
          Files that will be attached
        </h2>
        {attached.length === 0 ? (
          <p className="mt-3 text-sm text-base-dark">
            No files are referenced.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 text-sm">
            {attached.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <FileText
                  className="size-4 text-base-dark"
                  aria-hidden="true"
                />
                <FileViewer file={item} />
                <span className="text-base-dark">
                  {evidenceCategoryLabel[item.category]} ·{' '}
                  {formatBytes(item.sizeBytes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface AttestationValues {
  authorized: boolean;
  submitterRole: string;
  approvalKind: 'reference' | 'not_available' | '';
  reference: string;
  explanation: string;
}

function firstError(errors: unknown[]) {
  return errors.find((error): error is string => typeof error === 'string');
}

function FieldError({ id, errors }: { id: string; errors: unknown[] }) {
  const message = firstError(errors);
  return message ? (
    <p id={id} className="text-sm font-bold text-error-dark">
      {message}
    </p>
  ) : null;
}

/** usa-form-group--error: a 4 px error bar beside a field that failed validation. */
const errorGroup = (errors: unknown[]) =>
  firstError(errors) ? 'border-l-4 border-error-dark pl-4' : undefined;

/** Where each attestation field's error summary link sends focus. */
const attestationTargets: Record<keyof AttestationValues, string> = {
  authorized: 'attest-authorized',
  submitterRole: 'attest-role',
  approvalKind: 'approval-reference',
  reference: 'approval-reference-input',
  explanation: 'approval-explanation',
};

function SubmitForm({
  bundle,
  completeness,
  obligationId,
  institutionName,
  accountingOfficer,
}: {
  bundle: ReportBundle;
  completeness: Completeness;
  obligationId: string;
  institutionName: string;
  accountingOfficer: AccountingOfficer | null;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // One key per review of one draft version: a retried request returns the same receipt.
  const idempotencyKey = useRef(crypto.randomUUID());
  const submit = useMutation({
    mutationFn: (attestation: Attestation) =>
      submitReport(
        obligationId,
        idempotencyKey.current,
        bundle.draft!.version,
        attestation,
      ),
    onSuccess: async (receipt) => {
      await invalidateReport(queryClient, obligationId);
      await navigate({
        to: '/institution/receipts/$receiptId',
        params: { receiptId: receipt.id },
      });
    },
    onError: async (error) => {
      if (isApiError(error, 422) || isApiError(error, 409)) {
        await queryClient.invalidateQueries({
          queryKey: reportKeys.bundle(obligationId),
        });
      }
    },
  });
  const form = useForm({
    defaultValues: {
      authorized: false,
      // Entered once under My account and reused here (PRD §12.2).
      submitterRole: session.user.jobTitle ?? '',
      approvalKind: '',
      reference: '',
      explanation: '',
    } as AttestationValues,
    onSubmit: ({ value }) => {
      submit.mutate({
        authorized: true,
        submitterRole: value.submitterRole.trim(),
        approval:
          value.approvalKind === 'reference'
            ? { kind: 'reference', reference: value.reference.trim() }
            : { kind: 'not_available', explanation: value.explanation.trim() },
      });
    },
  });
  const blocked = completeness.missing.length > 0;
  return (
    <section
      aria-labelledby="attest-heading"
      className="rounded-lg border bg-white p-5"
    >
      <h2 id="attest-heading" className="font-bold">
        Confirm and submit
      </h2>
      <p className="mt-1 text-sm text-base-dark">
        A submitted revision cannot be changed. Your draft stays saved if
        anything below is incomplete.
      </p>
      <form
        className="mt-4 grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Subscribe
          selector={(state) => ({
            attempts: state.submissionAttempts,
            meta: state.fieldMeta,
          })}
        >
          {({ attempts, meta }) => (
            <ErrorSummary
              key={attempts}
              problems={
                attempts === 0
                  ? []
                  : (
                      Object.keys(
                        attestationTargets,
                      ) as (keyof AttestationValues)[]
                    ).flatMap((name) => {
                      const message = firstError(meta[name]?.errors ?? []);
                      return message
                        ? [{ target: attestationTargets[name], message }]
                        : [];
                    })
              }
            />
          )}
        </form.Subscribe>
        <form.Field
          name="authorized"
          validators={{
            onSubmit: ({ value }) =>
              value ? undefined : 'Confirm that you are authorized to submit.',
          }}
        >
          {(field) => (
            <div
              className={cn('grid gap-1', errorGroup(field.state.meta.errors))}
            >
              <FieldError
                id="attest-authorized-error"
                errors={field.state.meta.errors}
              />
              <div className="flex min-h-touch items-start gap-3">
                <Checkbox
                  id="attest-authorized"
                  checked={field.state.value}
                  onCheckedChange={(checked) =>
                    field.handleChange(checked === true)
                  }
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby="attest-authorized-error"
                  className="mt-1"
                />
                <Label
                  htmlFor="attest-authorized"
                  className="leading-snug font-normal"
                >
                  I am authorized to submit this report on behalf of{' '}
                  {institutionName}.
                </Label>
              </div>
            </div>
          )}
        </form.Field>
        <form.Field
          name="submitterRole"
          validators={{
            onSubmit: ({ value }) =>
              value.trim().length >= 2
                ? undefined
                : 'Enter your role or delegation reference.',
          }}
        >
          {(field) => (
            <div
              className={cn(
                'grid max-w-mobile-lg gap-2',
                errorGroup(field.state.meta.errors),
              )}
            >
              <Label htmlFor="attest-role">
                Your role or delegation reference
              </Label>
              <FieldError
                id="attest-role-error"
                errors={field.state.meta.errors}
              />
              <Input
                id="attest-role"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="e.g. Integrity Assurance Officer"
                autoComplete="organization-title"
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby="attest-role-error"
              />
            </div>
          )}
        </form.Field>
        <form.Field
          name="approvalKind"
          validators={{
            onSubmit: ({ value }) => (value ? undefined : 'Choose one option.'),
          }}
        >
          {(field) => (
            <fieldset
              className={cn('grid gap-2', errorGroup(field.state.meta.errors))}
            >
              <legend className="font-bold">
                Institutional approval of this report
              </legend>
              <p className="text-sm text-base-dark">
                Give the approval reference from the Corruption Prevention
                Committee (CPC) or the Accounting Officer
                {accountingOfficer &&
                  ` (${accountingOfficer.name}, ${accountingOfficer.designation}, chairs your CPC)`}
                . If approval is not available, say so; this is recorded as a
                review deficiency, not a false statement.
              </p>
              <FieldError
                id="attest-kind-error"
                errors={field.state.meta.errors}
              />
              <RadioGroup
                value={field.state.value}
                onValueChange={(value) =>
                  field.handleChange(value as AttestationValues['approvalKind'])
                }
                aria-describedby="attest-kind-error"
                className="grid gap-2"
              >
                <div className="flex min-h-touch items-center gap-2">
                  <RadioGroupItem id="approval-reference" value="reference" />
                  <Label htmlFor="approval-reference" className="font-normal">
                    Approved; I have the reference
                  </Label>
                </div>
                <div className="flex min-h-touch items-center gap-2">
                  <RadioGroupItem
                    id="approval-unavailable"
                    value="not_available"
                  />
                  <Label htmlFor="approval-unavailable" className="font-normal">
                    Approval is not available
                  </Label>
                </div>
              </RadioGroup>
            </fieldset>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.approvalKind}>
          {(kind) =>
            kind === 'reference' ? (
              <form.Field
                name="reference"
                validators={{
                  onSubmit: ({ value }) =>
                    value.trim().length >= 2
                      ? undefined
                      : 'Enter the approval reference.',
                }}
              >
                {(field) => (
                  <div
                    className={cn(
                      'grid max-w-mobile-lg gap-2',
                      errorGroup(field.state.meta.errors),
                    )}
                  >
                    <Label htmlFor="approval-reference-input">
                      Approval reference
                    </Label>
                    <FieldError
                      id="approval-reference-error"
                      errors={field.state.meta.errors}
                    />
                    <Input
                      id="approval-reference-input"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder="e.g. CPC minutes 12 Sep 2026, item 4"
                      aria-invalid={field.state.meta.errors.length > 0}
                      aria-describedby="approval-reference-error"
                    />
                  </div>
                )}
              </form.Field>
            ) : kind === 'not_available' ? (
              <form.Field
                name="explanation"
                validators={{
                  onSubmit: ({ value }) =>
                    value.trim().length >= 10
                      ? undefined
                      : 'Explain why (at least 10 characters).',
                }}
              >
                {(field) => (
                  <div
                    className={cn(
                      'grid gap-2',
                      errorGroup(field.state.meta.errors),
                    )}
                  >
                    <Label htmlFor="approval-explanation">
                      Why approval is not available
                    </Label>
                    <FieldError
                      id="approval-explanation-error"
                      errors={field.state.meta.errors}
                    />
                    <Textarea
                      id="approval-explanation"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={field.state.meta.errors.length > 0}
                      aria-describedby="approval-explanation-error"
                    />
                  </div>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
        {submit.isError && (
          <Alert variant="destructive">
            <AlertTitle>The report was not submitted</AlertTitle>
            <AlertDescription>
              {submit.error.message}
              {!isApiError(submit.error) &&
                ' You can try again safely; a retry cannot create a duplicate submission.'}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={blocked || submit.isPending}>
            <Send aria-hidden="true" />
            {submit.isPending ? 'Submitting…' : 'Submit report'}
          </Button>
          {blocked && (
            <p className="text-sm text-base-dark">
              Complete the items listed above first.
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

export function ReviewSubmitPage() {
  const { periodId } = route.useParams();
  const session = useSession();
  const obligationId = obligationIdFor(
    session.user.institutionId ?? '',
    periodId,
  );
  const bundle = useQuery(reportQuery(obligationId));
  const completeness = useQuery(completenessQuery(obligationId));
  const institution = useQuery(
    institutionQuery(session.user.institutionId ?? ''),
  );
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={bundle.data?.period.label}
        title="Review and submit"
        description={
          bundle.data?.draft?.savedAt
            ? `Reviewing the draft saved ${formatDateTime(bundle.data.draft.savedAt)}.`
            : undefined
        }
        actions={
          <Link
            to="/institution/reports/$periodId"
            params={{ periodId }}
            className={buttonVariants({ variant: 'plain' })}
          >
            <ArrowLeft aria-hidden="true" />
            Back to the report
          </Link>
        }
      />
      <Glossary />
      <QueryView query={bundle} label="report">
        {(data) =>
          !data.editable || !data.draft ? (
            <Alert>
              <AlertTitle>
                {data.editable
                  ? 'Save your draft first'
                  : 'This report cannot be submitted now'}
              </AlertTitle>
              <AlertDescription>
                Return to the report to continue.
              </AlertDescription>
            </Alert>
          ) : (
            <QueryView query={completeness} label="completion check">
              {(check) => (
                <div className="grid gap-6">
                  <Checklist completeness={check} periodId={periodId} />
                  <ChangesSinceSubmitted bundle={data} periodId={periodId} />
                  <ClaimsSummary bundle={data} />
                  <SubmitForm
                    key={data.draft!.version}
                    bundle={data}
                    completeness={check}
                    obligationId={obligationId}
                    institutionName={institution.data?.name ?? 'my institution'}
                    accountingOfficer={
                      institution.data?.accountingOfficer ?? null
                    }
                  />
                </div>
              )}
            </QueryView>
          )
        }
      </QueryView>
    </div>
  );
}
