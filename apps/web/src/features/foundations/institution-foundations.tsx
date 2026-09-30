import type { FoundationIndicator } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { invalidateEvents } from '@/features/events/queries';
import {
  foundationKeys,
  foundationsQuery,
  uploadFoundation,
  withdrawFoundation,
} from '@/features/foundations/queries';
import { VersionList } from '@/features/foundations/version-list';
import { useSession } from '@/features/session/use-session';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';

/** With an active version, recording a replacement is opened on request, not always shown. */
function VersionActions({
  institutionId,
  indicator,
  activeVersionId,
}: {
  institutionId: string;
  indicator: FoundationIndicator;
  activeVersionId: string | undefined;
}) {
  const [recording, setRecording] = useState(false);
  if (!activeVersionId || recording)
    return (
      <NewVersion
        institutionId={institutionId}
        indicator={indicator}
        onCancel={activeVersionId ? () => setRecording(false) : undefined}
      />
    );
  return (
    <div className="flex flex-wrap items-start gap-2">
      <Button variant="outline" size="sm" onClick={() => setRecording(true)}>
        Record a new version
      </Button>
      <Withdraw institutionId={institutionId} versionId={activeVersionId} />
    </div>
  );
}

function NewVersion({
  institutionId,
  indicator,
  onCancel,
}: {
  institutionId: string;
  indicator: FoundationIndicator;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [approvalReference, setApprovalReference] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [claims, setClaims] = useState([true, true, true, true]);
  const [progress, setProgress] = useState<number | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      uploadFoundation(
        institutionId,
        {
          file: file!,
          kind: indicator.kind,
          approvalReference,
          effectiveFrom,
          claimedChecks: claims,
        },
        setProgress,
      ),
    onSuccess: async (next) => {
      queryClient.setQueryData(foundationKeys.all(institutionId), next);
      setFile(null);
      setApprovalReference('');
      setEffectiveFrom('');
      await invalidateEvents(queryClient);
      onCancel?.();
    },
    onSettled: () => setProgress(null),
  });
  const incomplete =
    !file || approvalReference.trim().length < 2 || !effectiveFrom;
  const fieldErrors = isApiError(mutation.error)
    ? mutation.error.fieldErrors
    : {};
  return (
    <form
      className="grid gap-3 bg-base-lightest p-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <h4 className="font-bold">Record a new version</h4>
      <p className="text-sm text-base-dark">
        The new version supersedes the active one from its effective date. It is
        never treated as valid for an earlier period.
      </p>
      <div className="grid gap-3 tablet:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-file`}>Approved document</Label>
          <Input
            id={`${id}-file`}
            type="file"
            accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {fieldErrors.file && (
            <p className="text-sm text-error-dark">{fieldErrors.file}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-approval`}>Approval reference</Label>
          <Input
            id={`${id}-approval`}
            value={approvalReference}
            onChange={(event) => setApprovalReference(event.target.value)}
            placeholder="e.g. CPC resolution 2 Oct 2026"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-effective`}>Effective from</Label>
          <Input
            id={`${id}-effective`}
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-bold">This document covers</legend>
        {indicator.checks.map((check, index) => (
          <div key={check} className="flex items-center gap-2">
            <Checkbox
              id={`${id}-claim-${index}`}
              checked={claims[index]}
              onCheckedChange={(checked) =>
                setClaims((current) =>
                  current.map((value, i) =>
                    i === index ? checked === true : value,
                  ),
                )
              }
            />
            <Label htmlFor={`${id}-claim-${index}`} className="font-normal">
              {check}
            </Label>
          </div>
        ))}
      </fieldset>
      {progress !== null && (
        <progress
          className="h-2 w-full max-w-mobile-lg accent-primary"
          value={progress}
          max={1}
          aria-label="Upload progress"
        />
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-error-dark">
          {mutation.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="submit"
          disabled={incomplete || mutation.isPending}
          aria-describedby={incomplete ? `${id}-hint` : undefined}
        >
          {mutation.isPending ? 'Uploading…' : 'Record version'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {incomplete && (
          <p id={`${id}-hint`} className="text-sm text-base-dark">
            Choose the approved document and give its approval reference and
            effective date.
          </p>
        )}
      </div>
    </form>
  );
}

function Withdraw({
  institutionId,
  versionId,
}: {
  institutionId: string;
  versionId: string;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => withdrawFoundation(versionId, reason),
    onSuccess: (next) =>
      queryClient.setQueryData(foundationKeys.all(institutionId), next),
  });
  if (!open)
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Withdraw the active version
      </Button>
    );
  return (
    <div className="grid gap-2">
      <Label htmlFor={`withdraw-${versionId}`}>
        Why is this version withdrawn?
      </Label>
      <Textarea
        id={`withdraw-${versionId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      {mutation.isError && (
        <p className="text-sm text-error-dark">{mutation.error.message}</p>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={reason.trim().length < 10 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Withdraw
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Procedures, risk assessment and mitigation plan: scored once for the year. */
export function InstitutionFoundations() {
  const session = useSession();
  const institutionId = session.user.institutionId ?? '';
  const foundations = useQuery(foundationsQuery(institutionId));
  return (
    <QueryView query={foundations} label="foundation documents">
      {(data) => (
        <div className="grid gap-6">
          <p className="text-sm text-base-dark">
            Procedures, the risk assessment and the mitigation plan are due{' '}
            {formatDateTime(data.deadline)}, separately from quarterly reports.
            Your officer reviews each document against four checks; results are
            released after annual evaluation.
          </p>
          {data.indicators.map((indicator) => {
            const active = indicator.versions.find(
              (version) => version.status === 'active',
            );
            return (
              <section
                key={indicator.kind}
                aria-labelledby={`f-${indicator.kind}`}
                className="grid gap-4 rounded-lg border bg-white p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id={`f-${indicator.kind}`} className="text-lg font-bold">
                    {indicator.label}
                  </h2>
                  <p className="text-sm text-base-dark">
                    {indicator.review
                      ? `Reviewed ${formatDateTime(indicator.review.reviewedAt)}`
                      : 'Not yet reviewed'}
                  </p>
                </div>
                <VersionList indicator={indicator} />
                <VersionActions
                  institutionId={institutionId}
                  indicator={indicator}
                  activeVersionId={active?.id}
                />
              </section>
            );
          })}
        </div>
      )}
    </QueryView>
  );
}
