import {
  contrastOnWhite,
  type ReportIdentity,
  type ReportIdentitySettings,
  type ReportIdentityUpdate,
  type ReportImageSlot,
} from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AnnualResultView } from '@/features/annual/result-view';
import { cycleQuery } from '@/features/directory/queries';
import {
  identityKeys,
  removeReportImage,
  reportIdentitySettingsQuery,
  saveReportIdentity,
  uploadReportImage,
} from '@/features/report-identity/queries';
import {
  ReportCover,
  ReportSignoff,
} from '@/features/report-identity/report-identity';
import { sampleEvaluation } from '@/features/report-identity/sample';
import { useUnsavedWork } from '@/features/session/unsaved-work';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';

const editable = (identity: ReportIdentity): ReportIdentityUpdate => ({
  organizationName: identity.organizationName,
  reportTitle: identity.reportTitle,
  accentColor: identity.accentColor,
  foreword: identity.foreword,
  contact: identity.contact,
  footer: identity.footer,
  signatory: identity.signatory,
  authorization: identity.authorization,
});

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
    <div className="grid gap-2">
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

function ImageField({
  slot,
  label,
  hint,
  identity,
  onChange,
}: {
  slot: ReportImageSlot;
  label: string;
  hint: string;
  identity: ReportIdentity;
  onChange: (result: ReportIdentitySettings) => Promise<void>;
}) {
  const upload = useMutation({
    mutationFn: (file: File) => uploadReportImage(slot, file),
    onSuccess: onChange,
  });
  const remove = useMutation({
    mutationFn: () => removeReportImage(slot),
    onSuccess: onChange,
  });
  const image = identity[slot];
  const id = `identity-${slot}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs text-base-dark">{hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          type="file"
          accept="image/png,image/jpeg"
          className="max-w-80"
          disabled={upload.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.target.value = '';
          }}
        />
        {image && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            <Trash2 aria-hidden="true" />
            Remove {label.toLowerCase()}
          </Button>
        )}
      </div>
      <p className="text-sm" aria-live="polite">
        {upload.isPending
          ? 'Uploading…'
          : image
            ? `In use: ${image.width} × ${image.height} px, ${Math.max(1, Math.round(image.sizeBytes / 1024))} KB.`
            : 'None.'}
      </p>
      {upload.isError && (
        <p role="alert" className="text-sm font-bold text-error-dark">
          <ImageUp className="mr-1 inline size-4" aria-hidden="true" />
          {upload.error.message}
        </p>
      )}
    </div>
  );
}

function IdentityEditor({
  identity,
  changes,
}: {
  identity: ReportIdentity;
  changes: { at: string; by: string; summary: string }[];
}) {
  const queryClient = useQueryClient();
  const cycle = useQuery(cycleQuery);
  const [saved, setSaved] = useState(editable(identity));
  const [draft, setDraft] = useState(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useUnsavedWork(dirty);
  const set = (patch: Partial<ReportIdentityUpdate>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: identityKeys.current });
  // Images are saved straight away; the text fields keep their unsaved edits.
  const imageChanged = async (result: ReportIdentitySettings) => {
    queryClient.setQueryData(identityKeys.settings, result);
    await refresh();
  };
  const save = useMutation({
    mutationFn: () => saveReportIdentity(draft),
    onSuccess: async (result) => {
      queryClient.setQueryData(identityKeys.settings, result);
      const next = editable(result.identity);
      setSaved(next);
      setDraft(next);
      await refresh();
    },
  });
  const errors = isApiError(save.error) ? save.error.fieldErrors : {};
  const ratio = /^#[0-9a-f]{6}$/i.test(draft.accentColor)
    ? contrastOnWhite(draft.accentColor)
    : null;
  const preview: ReportIdentity = {
    ...draft,
    logo: identity.logo,
    signature: identity.signature,
  };
  const describedBy = (id: string, hint = false) =>
    [hint && `${id}-hint`, errors[id.replace('identity-', '')] && `${id}-error`]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="grid items-start gap-6 desktop:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        className="grid gap-5 rounded-lg border bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
        aria-label="Report identity"
      >
        <Field
          id="identity-organizationName"
          label="Issuing organization"
          hint="Shown as the issuer on every report. An official body (for example EACC) can be named only with a recorded authorization."
          error={errors.organizationName}
        >
          <Input
            id="identity-organizationName"
            value={draft.organizationName}
            aria-invalid={Boolean(errors.organizationName)}
            aria-describedby={describedBy('identity-organizationName', true)}
            onChange={(event) => set({ organizationName: event.target.value })}
          />
        </Field>
        <Field
          id="identity-reportTitle"
          label="Report title"
          hint="The cycle is added after it, e.g. “… · FY 2026/27”."
          error={errors.reportTitle}
        >
          <Input
            id="identity-reportTitle"
            value={draft.reportTitle}
            aria-invalid={Boolean(errors.reportTitle)}
            aria-describedby={describedBy('identity-reportTitle', true)}
            onChange={(event) => set({ reportTitle: event.target.value })}
          />
        </Field>
        <Field
          id="identity-accentColor"
          label="Accent colour"
          hint="Used for the title and rules. It must reach 4.5:1 contrast on white; status is never shown by colour alone."
          error={errors.accentColor}
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              aria-label="Pick the accent colour"
              value={
                /^#[0-9a-f]{6}$/i.test(draft.accentColor)
                  ? draft.accentColor
                  : '#530b61'
              }
              onChange={(event) =>
                set({ accentColor: event.target.value.toUpperCase() })
              }
              className="h-touch w-16 cursor-pointer rounded-md border"
            />
            <Input
              id="identity-accentColor"
              value={draft.accentColor}
              className="w-32 font-mono"
              aria-invalid={Boolean(errors.accentColor)}
              aria-describedby={describedBy('identity-accentColor', true)}
              onChange={(event) => set({ accentColor: event.target.value })}
            />
            {ratio !== null && (
              <span className="text-sm">
                Contrast {ratio.toFixed(1)}:1{' '}
                {ratio >= 4.5 ? '(passes)' : '(too light: choose darker)'}
              </span>
            )}
          </div>
        </Field>
        <Field
          id="identity-foreword"
          label="Foreword (optional)"
          error={errors.foreword}
        >
          <Textarea
            id="identity-foreword"
            value={draft.foreword}
            rows={4}
            onChange={(event) => set({ foreword: event.target.value })}
          />
        </Field>
        <Field
          id="identity-contact"
          label="Contact details (optional)"
          error={errors.contact}
        >
          <Input
            id="identity-contact"
            value={draft.contact}
            onChange={(event) => set({ contact: event.target.value })}
          />
        </Field>
        <Field
          id="identity-footer"
          label="Footer or disclaimer (optional)"
          error={errors.footer}
        >
          <Input
            id="identity-footer"
            value={draft.footer}
            onChange={(event) => set({ footer: event.target.value })}
          />
        </Field>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-bold">Signatory (optional)</legend>
          <div className="flex items-center gap-2">
            <Checkbox
              id="identity-signatory"
              checked={draft.signatory !== null}
              onCheckedChange={(checked) =>
                set({
                  signatory: checked === true ? { name: '', title: '' } : null,
                })
              }
            />
            <Label htmlFor="identity-signatory" className="font-normal">
              Sign the report
            </Label>
          </div>
          {draft.signatory && (
            <div className="grid gap-3 tablet:grid-cols-2">
              <Field
                id="identity-signatory-name"
                label="Signatory name"
                error={errors['signatory.name']}
              >
                <Input
                  id="identity-signatory-name"
                  value={draft.signatory.name}
                  onChange={(event) =>
                    set({
                      signatory: {
                        ...draft.signatory!,
                        name: event.target.value,
                      },
                    })
                  }
                />
              </Field>
              <Field
                id="identity-signatory-title"
                label="Signatory title"
                error={errors['signatory.title']}
              >
                <Input
                  id="identity-signatory-title"
                  value={draft.signatory.title}
                  onChange={(event) =>
                    set({
                      signatory: {
                        ...draft.signatory!,
                        title: event.target.value,
                      },
                    })
                  }
                />
              </Field>
            </div>
          )}
        </fieldset>
        <Field
          id="identity-authorization"
          label="Authorization to issue in an official body's name (optional)"
          hint="Only when an official body has authorized this deployment to publish in its name: record the reference here. The simulation marking stays on every report regardless."
          error={errors.authorization}
        >
          <Textarea
            id="identity-authorization"
            value={draft.authorization ?? ''}
            rows={2}
            aria-describedby={describedBy('identity-authorization', true)}
            onChange={(event) =>
              set({ authorization: event.target.value || null })
            }
          />
        </Field>
        {save.isError && (
          <p role="alert" className="text-sm font-bold text-error-dark">
            {save.error.message}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!dirty || save.isPending}>
            <Save aria-hidden="true" />
            Save identity
          </Button>
          <span className="text-sm text-base-dark" aria-live="polite">
            {save.isPending
              ? 'Saving…'
              : dirty
                ? 'Unsaved changes: the preview shows them.'
                : 'Saved.'}
          </span>
        </div>
        <div className="grid gap-4 border-t pt-4">
          <ImageField
            slot="logo"
            label="Logo"
            hint="PNG or JPEG without transparency, up to 300 KB and 1200 × 1200 px. Saved straight away."
            identity={identity}
            onChange={imageChanged}
          />
          {(draft.signatory ?? identity.signatory) && (
            <ImageField
              slot="signature"
              label="Signature image"
              hint="Optional, shown above the signatory's name. Same limits as the logo."
              identity={identity}
              onChange={imageChanged}
            />
          )}
        </div>
        {changes.length > 0 && (
          <details className="border-t pt-4 text-sm">
            <summary className="cursor-pointer font-bold">
              Change history ({changes.length})
            </summary>
            <ul className="mt-2 grid gap-1">
              {changes.map((change) => (
                <li key={`${change.at}-${change.summary}`}>
                  {formatDateTime(change.at)}, {change.by}: {change.summary}
                </li>
              ))}
            </ul>
          </details>
        )}
      </form>

      <section
        aria-labelledby="identity-preview-heading"
        className="grid gap-4 rounded-lg border bg-base-lightest p-4 desktop:sticky desktop:top-[calc(var(--sticky-top)+1rem)]"
      >
        <div>
          <h2 id="identity-preview-heading" className="font-bold">
            Preview with sample data
          </h2>
          <p className="text-sm text-base-dark">
            A fictional institution&rsquo;s cover and result page, as on screen
            and in print. Published reports keep the identity they were
            published with.
          </p>
        </div>
        <ReportCover
          identity={preview}
          cycleLabel={cycle.data?.label ?? 'FY 2026/27'}
          subject={`${sampleEvaluation.institutionId} · ${sampleEvaluation.institutionName}`}
        />
        <AnnualResultView
          evaluation={sampleEvaluation}
          profileName="Hackathon Mock v1"
          simulation
        />
        <ReportSignoff identity={preview} />
      </section>
    </div>
  );
}

/** Who issues the annual report and how it is branded (HP2-65). */
export function ReportIdentityPage() {
  const settings = useQuery(reportIdentitySettingsQuery);
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Publication"
        title="Report identity"
        description="The issuing organization, title, colour, foreword, contact, footer and signatory used by the annual reports on screen, in print and in downloads. Layout, accessibility and the simulation marking are fixed."
      />
      <Alert>
        <AlertDescription>
          Published reports keep the identity in force when they were published.
          A correction is released under the identity in force at that time.
        </AlertDescription>
      </Alert>
      <QueryView query={settings} label="report identity">
        {(data) => (
          <IdentityEditor identity={data.identity} changes={data.changes} />
        )}
      </QueryView>
    </div>
  );
}
