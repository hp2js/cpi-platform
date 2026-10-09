import { Inject, Injectable } from '@nestjs/common';
import {
  diffForms,
  formCheckRequestSchema,
  formCreation,
  formDiscardSchema,
  formDraftUpdateSchema,
  periodImpact,
  summarizeChanges,
  type Cycle,
  type FormCheck,
  type FormCreation,
  type FormImpact,
  type FormValidation,
  type FormVersion,
} from '@cpi/contracts';
import type { User } from '../auth/sessions';
import { DB, write, type Database, type Db } from '../database/db';
import {
  currentState,
  loadCycle,
  loadForms,
  loadProfiles,
} from '../database/state';
import { Events, usersWithRole } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { FormsRepository } from './forms.repository';
import { periodLocked, validateForm } from './rules';

function issuesAsFieldErrors(issues: { path: string; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) fieldErrors[issue.path] ??= issue.message;
  return fieldErrors;
}

const periodLabel = (cycle: Cycle) => (periodId: string) =>
  cycle.periods.find((period) => period.id === periodId)?.label ?? periodId;

/** A draft's differences from the version it was based on (FR03, AT04). */
function changesOf(form: FormVersion, forms: FormVersion[], cycle: Cycle) {
  const base = forms.find(
    (candidate) => candidate.version === form.basedOnVersion,
  );
  return diffForms(base, form, periodLabel(cycle));
}

/** Everyone told when a version is published (FR03). */
const notifiedRoles = ['institution', 'officer', 'supervisor'] as const;

/** Reporting form versions (FR03). Drafts are administrator-only. */
@Injectable()
export class FormsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: FormsRepository,
    private readonly events: Events,
  ) {}

  /** Everything the publication rules read (PRD §7.1, FR03). */
  private async formContext(db: Db) {
    const [{ state, profile }, cycle, forms, profiles, started] =
      await Promise.all([
        currentState(db),
        loadCycle(db),
        loadForms(db),
        loadProfiles(db),
        this.repository.startedPeriodIds(db),
      ]);
    return {
      businessTime: state.businessTime,
      cycle,
      forms,
      profile,
      profiles,
      startedPeriodIds: new Set(started),
    };
  }

  private async find(db: Db, id: string) {
    const form = await this.repository.form(id, db);
    if (!form) throw notFound();
    return form;
  }

  async list(user: User): Promise<FormVersion[]> {
    const forms = await loadForms(this.db);
    return forms
      .filter(
        (form) => user.role === 'administrator' || form.status === 'published',
      )
      .reverse();
  }

  async get(user: User, id: string): Promise<FormVersion> {
    const form = await this.find(this.db, id);
    if (form.status === 'draft' && user.role !== 'administrator')
      throw notFound();
    return form;
  }

  async validation(id: string): Promise<FormValidation> {
    const form = await this.find(this.db, id);
    const issues = validateForm(form, await this.formContext(this.db));
    return { valid: issues.length === 0, issues };
  }

  /** Whether a new version can be started now, and which periods it could use (FR03). */
  async creation(): Promise<FormCreation> {
    const context = await this.formContext(this.db);
    return formCreation(context.forms, context.cycle, (periodId) =>
      periodLocked(context, periodId),
    );
  }

  /**
   * Publication checks, changes and impact for a draft as edited, before it is saved, so the
   * editor can point to each problem as it appears (FR03). Nothing is written.
   */
  async check(id: string, body: unknown): Promise<FormCheck> {
    const form = await this.find(this.db, id);
    if (form.status !== 'draft')
      throw new ApiError(
        409,
        'Published versions cannot be edited. Create a new version instead.',
        'version_locked',
      );
    const parsed = formCheckRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiError(
        422,
        'Check the highlighted fields.',
        'invalid_form',
        issuesAsFieldErrors(
          parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
    const context = await this.formContext(this.db);
    const edited = { ...form, ...parsed.data };
    const issues = validateForm(edited, context);
    return {
      valid: issues.length === 0,
      issues,
      changes: changesOf(edited, context.forms, context.cycle),
      impact: await this.impact(edited, context),
    };
  }

  private async impact(
    form: FormVersion,
    context: Awaited<ReturnType<FormsService['formContext']>>,
  ): Promise<FormImpact> {
    const periods = periodImpact(form, context.forms, context.cycle, (id) =>
      periodLocked(context, id),
    );
    const [institutions, ...recipients] = await Promise.all([
      this.repository.institutionsReportingIn(
        periods
          .filter((period) => period.nextVersion === form.version)
          .map((period) => period.periodId),
        this.db,
      ),
      ...notifiedRoles.map(async (role) => ({
        role,
        count: (await usersWithRole(this.db, role)).length,
      })),
    ]);
    return {
      periods,
      institutions,
      recipients,
      locksProfile: !form.weightsLocked,
    };
  }

  update(user: User, id: string, body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const form = await this.find(tx, id);
      if (form.status !== 'draft')
        throw new ApiError(
          409,
          'Published versions cannot be edited. Create a new version instead.',
          'version_locked',
        );
      const parsed = formDraftUpdateSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Check the highlighted fields.',
          'invalid_form',
          issuesAsFieldErrors(
            parsed.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          ),
        );
      // Two administrators, or two tabs, cannot silently overwrite each other's edits.
      if (parsed.data.baseRevision !== form.revision)
        throw new ApiError(
          409,
          'Someone saved this draft after you opened it. Reload to see their changes, then make yours again.',
          'version_conflict',
        );
      const { title, periodIds, sections } = parsed.data;
      const { profile } = await currentState(tx);
      const [cycle, forms] = await Promise.all([loadCycle(tx), loadForms(tx)]);
      const next = {
        ...form,
        title,
        periodIds,
        sections,
        // A snapshot of the cycle profile's weights; they are set in Settings, not here.
        weights: profile.weights,
        updatedAt: businessTime,
        revision: form.revision + 1,
      };
      next.changes = changesOf(next, forms, cycle);
      const updated = await this.repository.updateForm(id, next, tx);
      await this.events.audit(
        tx,
        businessTime,
        user,
        'form.draft_save',
        { type: 'form', id, version: form.version },
        `Draft version ${form.version} saved: ${summarizeChanges(next.changes)}`,
      );
      return updated;
    });
  }

  publish(user: User, id: string) {
    return write(this.db, async (tx, businessTime) => {
      const form = await this.find(tx, id);
      if (form.status !== 'draft')
        throw new ApiError(
          409,
          'This version is already published.',
          'already_published',
        );
      const context = await this.formContext(tx);
      const issues = validateForm(form, context);
      if (issues.length)
        throw new ApiError(
          422,
          'Publication is blocked. Fix the listed issues and try again.',
          'publication_blocked',
          issuesAsFieldErrors(issues),
        );
      // The scoring profile is locked for the cycle from the first publication (PRD §7.1).
      await this.repository.lockWeights(tx);
      // Future-period assignments move to the new version; started periods keep theirs.
      for (const other of context.forms)
        if (other.id !== form.id && other.status === 'published')
          await this.repository.updateForm(
            other.id,
            {
              periodIds: other.periodIds.filter(
                (periodId) => !form.periodIds.includes(periodId),
              ),
            },
            tx,
          );
      const changes = changesOf(form, context.forms, context.cycle);
      const quarters = form.periodIds
        .map(periodLabel(context.cycle))
        .join(', ');
      const published = await this.repository.updateForm(
        form.id,
        {
          status: 'published',
          publishedAt: businessTime,
          weights: context.profile.weights,
          changes,
        },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'form.publish',
        { type: 'form', id: form.id, version: form.version },
        `Version ${form.version} for ${quarters}. ${form.basedOnVersion ? summarizeChanges(changes) : 'First version'}`,
      );
      await this.events.notify(
        tx,
        businessTime,
        `${form.id}:published`,
        'form.published',
        (
          await Promise.all(
            notifiedRoles.map((role) => usersWithRole(tx, role)),
          )
        ).flat(),
        {
          title: `Reporting form version ${form.version} published`,
          body: form.basedOnVersion
            ? `${quarters} will use version ${form.version}. Changes from version ${form.basedOnVersion}: ${summarizeChanges(changes)}.`
            : `The quarterly progress report form is available for ${quarters}.`,
          link: (recipient) =>
            recipient.role === 'institution'
              ? '/institution'
              : recipient.role === 'supervisor'
                ? '/supervisor/rules'
                : '/officer/rules',
        },
      );
      return published;
    });
  }

  create(user: User) {
    return write(this.db, async (tx, businessTime) => {
      const context = await this.formContext(tx);
      const creation = formCreation(context.forms, context.cycle, (periodId) =>
        periodLocked(context, periodId),
      );
      if (context.forms.some((form) => form.status === 'draft'))
        throw new ApiError(409, creation.reason!, 'draft_exists');
      if (!creation.allowed)
        throw new ApiError(409, creation.reason!, 'no_assignable_period');
      const latest = context.forms.at(-1);
      if (!latest) throw notFound();
      const draft = await this.repository.insertForm(
        {
          ...latest,
          id: `form-v${latest.version + 1}`,
          version: latest.version + 1,
          status: 'draft',
          publishedAt: null,
          basedOnVersion: latest.version,
          periodIds: latest.periodIds.filter(
            (periodId) => !periodLocked(context, periodId),
          ),
          updatedAt: businessTime,
          revision: 0,
          changes: [],
        },
        tx,
      );
      const withChanges = await this.repository.updateForm(
        draft.id,
        { changes: changesOf(draft, context.forms, context.cycle) },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'form.draft_create',
        { type: 'form', id: draft.id, version: draft.version },
        `Draft version ${draft.version} started from version ${latest.version}`,
      );
      return withChanges;
    });
  }

  /** An unpublished draft can be discarded with a reason; the first version cannot. */
  discard(user: User, id: string, body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const form = await this.find(tx, id);
      if (form.status !== 'draft')
        throw new ApiError(
          409,
          'Published versions are kept for the record and cannot be discarded.',
          'version_locked',
        );
      const forms = await loadForms(tx);
      if (!forms.some((candidate) => candidate.status === 'published'))
        throw new ApiError(
          409,
          'The first version cannot be discarded. Edit it and publish it instead.',
          'first_version',
        );
      const parsed = formDiscardSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Give a reason of at least 10 characters.',
          'reason_required',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      await this.repository.deleteForm(id, tx);
      await this.events.audit(
        tx,
        businessTime,
        user,
        'form.discard',
        { type: 'form', id, version: form.version },
        `Draft version ${form.version} discarded: ${parsed.data.reason}`,
      );
    });
  }
}
