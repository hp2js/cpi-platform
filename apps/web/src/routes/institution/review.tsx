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
import { PageHeader } from '@/components/page-header';
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
          className="rounded-lg border border-destructive/40 bg-card p-5"
        >
          <h2
            id="missing-heading"
            className="flex items-center gap-2 font-semibold text-destructive"
          >
            <CircleAlert className="size-5" aria-hidden="true" />
            {completeness.missing.length} item
            {completeness.missing.length === 1 ? '' : 's'} to complete before
            you can submit
          </h2>
          <ul className="mt-3 grid gap-2 text-sm">
            {completeness.missing.map((item) => (
              <li key={`${item.field}-${item.message}`}>
                <Link
                  to="/institution/reports/$periodId"
                  params={{ periodId }}
                  hash={fieldDomId(item.field)}
                  className="font-medium text-primary underline-offset-4 hover:underline"
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
          className="rounded-lg border bg-card p-5"
        >
          <h2
            id="ready-heading"
            className="flex items-center gap-2 font-semibold"
          >
            <CircleCheck className="size-5 text-primary" aria-hidden="true" />
            Every required item is answered
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Check the declarations below, then confirm your authority to submit.
          </p>
        </section>
      )}
      {completeness.declarations.length > 0 && (
        <section
          aria-labelledby="declarations-heading"
          className="rounded-lg border bg-card p-5"
        >
          <h2 id="declarations-heading" className="font-semibold">
            Declarations you are making
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These are honest statements, not errors. They are recorded on your
            receipt and considered by the reviewing officer.
          </p>
          <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-sm">
            {completeness.declarations.map((item) => (
              <li key={`${item.field}-${item.message}`}>
                <span className="font-medium">{item.label}</span>:{' '}
                {item.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ClaimsSummary({ bundle }: { bundle: ReportBundle }) {
  const answers = bundle.draft?.answers;
  const attached = bundle.evidence.filter((item) =>
    referencedIds(bundle).includes(item.id),
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-labelledby="claims-heading"
        className="rounded-lg border bg-card p-5"
      >
        <h2 id="claims-heading" className="font-semibold">
          Milestone claims
        </h2>
        <ul className="mt-3 grid gap-2 text-sm">
          {bundle.baseline.milestones.map((milestone) => {
            const response = answers?.milestones[milestone.id];
            return (
              <li key={milestone.id} className="flex justify-between gap-3">
                <span>
                  <span className="font-medium">{milestone.code}</span>{' '}
                  {milestone.title}
                </span>
                <span className="shrink-0 text-muted-foreground">
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
        className="rounded-lg border bg-card p-5"
      >
        <h2 id="files-heading" className="font-semibold">
          Files that will be attached
        </h2>
        {attached.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No files are referenced.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 text-sm">
            {attached.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <FileText
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <FileViewer file={item} />
                <span className="text-muted-foreground">
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

function FieldError({ id, errors }: { id: string; errors: unknown[] }) {
  const message = errors.find((error) => typeof error === 'string');
  return message ? (
    <p id={id} className="text-sm text-destructive">
      {message as string}
    </p>
  ) : null;
}

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
      className="rounded-lg border bg-card p-5"
    >
      <h2 id="attest-heading" className="font-semibold">
        Confirm and submit
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
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
        <form.Field
          name="authorized"
          validators={{
            onSubmit: ({ value }) =>
              value ? undefined : 'Confirm that you are authorized to submit.',
          }}
        >
          {(field) => (
            <div className="grid gap-1">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="attest-authorized"
                  checked={field.state.value}
                  onCheckedChange={(checked) =>
                    field.handleChange(checked === true)
                  }
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby="attest-authorized-error"
                  className="mt-0.5"
                />
                <Label
                  htmlFor="attest-authorized"
                  className="leading-snug font-normal"
                >
                  I am authorized to submit this report on behalf of{' '}
                  {institutionName}.
                </Label>
              </div>
              <FieldError
                id="attest-authorized-error"
                errors={field.state.meta.errors}
              />
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
            <div className="grid max-w-md gap-1.5">
              <Label htmlFor="attest-role">
                Your role or delegation reference
              </Label>
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
              <FieldError
                id="attest-role-error"
                errors={field.state.meta.errors}
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
            <fieldset className="grid gap-2">
              <legend className="font-medium">
                Institutional approval of this report
              </legend>
              <p className="text-sm text-muted-foreground">
                Give the CPC or Accounting Officer approval reference
                {accountingOfficer &&
                  ` (${accountingOfficer.name}, ${accountingOfficer.designation}, chairs your CPC)`}
                . If approval is not available, say so; this is recorded as a
                review deficiency, not a false statement.
              </p>
              <RadioGroup
                value={field.state.value}
                onValueChange={(value) =>
                  field.handleChange(value as AttestationValues['approvalKind'])
                }
                aria-describedby="attest-kind-error"
                className="grid gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="approval-reference" value="reference" />
                  <Label htmlFor="approval-reference" className="font-normal">
                    Approved; I have the reference
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    id="approval-unavailable"
                    value="not_available"
                  />
                  <Label htmlFor="approval-unavailable" className="font-normal">
                    Approval is not available
                  </Label>
                </div>
              </RadioGroup>
              <FieldError
                id="attest-kind-error"
                errors={field.state.meta.errors}
              />
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
                  <div className="grid max-w-md gap-1.5">
                    <Label htmlFor="approval-reference-input">
                      Approval reference
                    </Label>
                    <Input
                      id="approval-reference-input"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder="e.g. CPC minutes 12 Sep 2026, item 4"
                      aria-describedby="approval-reference-error"
                    />
                    <FieldError
                      id="approval-reference-error"
                      errors={field.state.meta.errors}
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
                  <div className="grid gap-1.5">
                    <Label htmlFor="approval-explanation">
                      Why approval is not available
                    </Label>
                    <Textarea
                      id="approval-explanation"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-describedby="approval-explanation-error"
                    />
                    <FieldError
                      id="approval-explanation-error"
                      errors={field.state.meta.errors}
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
            <p className="text-sm text-muted-foreground">
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
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft aria-hidden="true" />
            Back to the report
          </Link>
        }
      />
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
