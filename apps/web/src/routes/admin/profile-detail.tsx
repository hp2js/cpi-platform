import type {
  ProfileChecklists,
  ProfileUpdate,
  ProfilesState,
  ScoringProfile,
} from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Copy, Lock } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  applyProfile,
  approveProfile,
  copyProfile,
  deleteProfile,
  profilesQuery,
  saveProfile,
  startRunWithProfile,
} from '@/features/settings/queries';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { statusLabel } from '@/features/settings/labels';

const route = getRouteApi('/authed/admin/profiles/$profileId');

const weightFields = [
  ['procedures', 'Procedures'],
  ['riskAssessment', 'Risk assessment'],
  ['mitigationPlan', 'Mitigation plan'],
  ['implementation', 'Implementation'],
] as const;

const checklistFields: [keyof ProfileChecklists, string][] = [
  ['procedures', 'Procedures'],
  ['riskAssessment', 'Risk assessment'],
  ['mitigationPlan', 'Mitigation plan'],
];

/** A button that confirms before running an action that cannot be undone. */
function Confirm({
  trigger,
  title,
  description,
  action,
  onConfirm,
  disabled,
  variant = 'default',
}: {
  trigger: string;
  title: string;
  description: ReactNode;
  action: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'destructive';
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} disabled={disabled}>
          {trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const toUpdate = (profile: ScoringProfile): ProfileUpdate => ({
  name: profile.name,
  weights: { ...profile.weights },
  proceduresMode: profile.proceduresMode,
  checklists: structuredClone(profile.checklists),
  sourceNote: profile.sourceNote,
});

function ProfileEditor({
  profile,
  state,
}: {
  profile: ScoringProfile;
  state: ProfilesState;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const editable = profile.status === 'draft';
  const [values, setValues] = useState<ProfileUpdate>(() => toUpdate(profile));
  const dirty = JSON.stringify(values) !== JSON.stringify(toUpdate(profile));
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: profilesQuery.queryKey });

  const save = useMutation({
    mutationFn: () => saveProfile(profile.id, values),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: async () => {
      if (dirty) await saveProfile(profile.id, values);
      return approveProfile(profile.id);
    },
    onSettled: refresh,
  });
  const apply = useMutation({
    mutationFn: () => applyProfile(profile.id),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const newRun = useMutation({
    mutationFn: () => startRunWithProfile(profile.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await navigate({ to: '/admin/simulation' });
    },
  });
  const copy = useMutation({
    mutationFn: () => copyProfile(profile.id),
    onSuccess: async (created) => {
      await refresh();
      await navigate({
        to: '/admin/profiles/$profileId',
        params: { profileId: created.id },
      });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteProfile(profile.id),
    onSuccess: async () => {
      await refresh();
      await navigate({ to: '/admin/profiles' });
    },
  });

  const error = [save, approve, apply, newRun, copy, remove].find(
    (mutation) => mutation.isError,
  )?.error;
  const errors = isApiError(error) ? error.fieldErrors : {};
  const issues = editable && !dirty ? profile.issues : [];
  const issueFor = (path: string) =>
    errors[path] ?? issues.find((issue) => issue.path === path)?.message;
  const total = weightFields.reduce(
    (sum, [key]) => sum + (values.weights[key] || 0),
    0,
  );
  const inUse = state.cycleProfileId === profile.id;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{statusLabel[profile.status]}</Badge>
        {inUse && <Badge>In use for this cycle</Badge>}
        {profile.simulation && (
          <Badge variant="secondary">Simulation profile</Badge>
        )}
        <span className="text-sm text-base-dark">
          {profile.formulaVersion} · half-up rounding to 2 decimal places
          {profile.approvedAt &&
            ` · approved ${formatDateTime(profile.approvedAt)} by ${profile.approvedBy}`}
        </span>
      </div>

      {profile.status === 'reference' && (
        <Alert>
          <AlertTitle>Reference only</AlertTitle>
          <AlertDescription>
            This documents a published structure. It has not been validated as a
            scoring method, so it cannot be applied as it stands; copy it to
            make a draft you can review and approve.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>That did not work</AlertTitle>
          <AlertDescription>
            {error.message}
            {Object.keys(errors).length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(errors).map(([path, message]) => (
                  <li key={path}>{message}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
      {editable && !dirty && profile.issues.length > 0 && (
        <Alert>
          <AlertTitle>Before this draft can be approved</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {profile.issues.map((issue) => (
                <li key={issue.path}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <form
        className="grid grid-cols-1 gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <fieldset className="grid max-w-tablet gap-2" disabled={!editable}>
          <Label htmlFor="profile-name">Name</Label>
          <Input
            id="profile-name"
            value={values.name}
            onChange={(event) =>
              setValues({ ...values, name: event.target.value })
            }
            aria-invalid={issueFor('name') ? true : undefined}
          />
          {issueFor('name') && (
            <p className="text-sm text-error-dark">{issueFor('name')}</p>
          )}
        </fieldset>

        <fieldset
          className="grid gap-4 rounded-lg border bg-white p-5"
          disabled={!editable}
        >
          <legend className="px-1 font-bold">Indicator weights</legend>
          <p className="text-sm text-base-dark">
            Points out of 100 for each indicator (PRD §10.5). Foundations count
            once a year; implementation averages the four quarters.
          </p>
          <div
            data-columns
            className="grid grid-cols-2 gap-3 tablet:grid-cols-4"
          >
            {weightFields.map(([key, label]) => (
              <div key={key} className="grid gap-2">
                <Label htmlFor={`weight-${key}`}>{label}</Label>
                <Input
                  id={`weight-${key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={values.weights[key]}
                  disabled={
                    key === 'procedures' &&
                    values.proceduresMode === 'prerequisite'
                  }
                  onChange={(event) =>
                    setValues({
                      ...values,
                      weights: {
                        ...values.weights,
                        [key]: Number(event.target.value),
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
          <p
            className={
              total === 100 ? 'text-sm' : 'text-sm font-bold text-error-dark'
            }
            aria-live="polite"
          >
            Total: {total}
            {total !== 100 && ' (must be 100)'}
          </p>
          {(issueFor('weights') ??
            issueFor('weights.procedures') ??
            issueFor('weights.implementation')) && (
            <p className="text-sm text-error-dark">
              {issueFor('weights') ??
                issueFor('weights.procedures') ??
                issueFor('weights.implementation')}
            </p>
          )}
          <div className="grid gap-2">
            <p className="text-sm font-bold" id="procedures-mode">
              How procedures count
            </p>
            <RadioGroup
              aria-labelledby="procedures-mode"
              value={values.proceduresMode}
              onValueChange={(value) =>
                setValues({
                  ...values,
                  proceduresMode: value as ProfileUpdate['proceduresMode'],
                  // A prerequisite carries no points, so its weight is fixed at 0.
                  weights:
                    value === 'prerequisite'
                      ? { ...values.weights, procedures: 0 }
                      : values.weights,
                })
              }
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="mode-scored" value="scored" />
                <Label htmlFor="mode-scored" className="font-normal">
                  Scored: procedures earn points by their weight
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="mode-prerequisite" value="prerequisite" />
                <Label htmlFor="mode-prerequisite" className="font-normal">
                  Prerequisite: shown as readiness with no points (weight 0)
                </Label>
              </div>
            </RadioGroup>
          </div>
        </fieldset>

        <fieldset
          className="grid gap-4 rounded-lg border bg-white p-5"
          disabled={!editable}
        >
          <legend className="px-1 font-bold">Foundation checklists</legend>
          <p className="text-sm text-base-dark">
            Each foundation has four equally weighted checks (PRD §10.3).
            Officers review against these, and institutions see them when they
            record a document.
          </p>
          <div className="grid grid-cols-1 gap-5 desktop:grid-cols-3">
            {checklistFields.map(([key, label]) => (
              <div key={key} className="grid content-start gap-2">
                <p className="text-sm font-bold">{label}</p>
                {values.checklists[key].map((check, index) => (
                  <div key={index} className="grid gap-1">
                    <Label
                      htmlFor={`check-${key}-${index}`}
                      className="text-xs font-normal text-base-dark"
                    >
                      Check {index + 1}
                    </Label>
                    <Input
                      id={`check-${key}-${index}`}
                      value={check}
                      onChange={(event) =>
                        setValues({
                          ...values,
                          checklists: {
                            ...values.checklists,
                            [key]: values.checklists[key].map((value, i) =>
                              i === index ? event.target.value : value,
                            ),
                          },
                        })
                      }
                    />
                  </div>
                ))}
                {issueFor(`checklists.${key}`) && (
                  <p className="text-sm text-error-dark">
                    {issueFor(`checklists.${key}`)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid max-w-measure gap-2" disabled={!editable}>
          <Label htmlFor="profile-source">Source and status note</Label>
          <Textarea
            id="profile-source"
            value={values.sourceNote}
            onChange={(event) =>
              setValues({ ...values, sourceNote: event.target.value })
            }
          />
          <p className="text-sm text-base-dark">
            Where the weights come from and who has confirmed them. Shown with
            the profile; it never claims official approval.
          </p>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {editable && (
            <>
              <Button
                type="submit"
                variant="outline"
                disabled={!dirty || save.isPending}
              >
                {save.isPending ? 'Saving…' : 'Save draft'}
              </Button>
              <Confirm
                trigger="Approve profile"
                title={`Approve ${values.name}?`}
                description="An approved profile can no longer be edited. It can then be applied to a cycle or used to start a new simulation run."
                action="Approve"
                disabled={approve.isPending}
                onConfirm={() => approve.mutate()}
              />
              <Confirm
                trigger="Delete draft"
                variant="destructive"
                title={`Delete ${profile.name}?`}
                description="The draft is removed. Approved and reference profiles are always kept."
                action="Delete"
                disabled={remove.isPending}
                onConfirm={() => remove.mutate()}
              />
            </>
          )}
          {profile.status === 'approved' &&
            !inUse &&
            (state.locked ? (
              <Confirm
                trigger="Start a new run with this profile"
                title={`Start a new run with ${profile.name}?`}
                description="The current simulation run's reports, reviews and results are replaced by a fresh run that uses this profile. Profiles are kept. This is how a different scoring experiment is tried (PRD §7.1)."
                action="Start new run"
                disabled={newRun.isPending}
                onConfirm={() => newRun.mutate()}
              />
            ) : (
              <Confirm
                trigger="Apply to this cycle"
                title={`Apply ${profile.name} to this cycle?`}
                description="Form versions will use these weights and checklists. The profile locks for the whole cycle when the first form version is published."
                action="Apply"
                disabled={apply.isPending}
                onConfirm={() => apply.mutate()}
              />
            ))}
          <Button
            type="button"
            variant="outline"
            disabled={copy.isPending}
            onClick={() => copy.mutate()}
          >
            <Copy aria-hidden="true" />
            Copy to a new draft
          </Button>
        </div>
        {profile.status === 'approved' && !inUse && state.locked && (
          <p className="flex items-start gap-2 text-sm text-base-dark">
            <Lock className="mt-1 size-4 shrink-0" aria-hidden="true" />
            {state.lockedReason}
          </p>
        )}
        {editable && (
          <p className="text-sm text-base-dark">
            Save or approve to check the draft. Approval needs weights totalling
            100, four different checks per foundation and a unique name.
          </p>
        )}
      </form>
    </div>
  );
}

export function ProfileDetailPage() {
  const { profileId } = route.useParams();
  const profiles = useQuery(profilesQuery);
  const profile = profiles.data?.profiles.find(
    (candidate) => candidate.id === profileId,
  );
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Scoring profile"
        title={profile?.name ?? 'Scoring profile'}
        description={profile?.sourceNote}
        actions={
          <Link
            to="/admin/profiles"
            className={buttonVariants({ variant: 'plain' })}
          >
            <ArrowLeft aria-hidden="true" />
            All profiles
          </Link>
        }
      />
      <QueryView query={profiles} label="scoring profile">
        {(state) =>
          profile ? (
            <ProfileEditor key={profile.id} profile={profile} state={state} />
          ) : (
            <p className="text-base-dark">
              This profile does not exist.{' '}
              <Link to="/admin/profiles" className="text-primary underline">
                See all profiles
              </Link>
              .
            </p>
          )
        }
      </QueryView>
    </div>
  );
}
