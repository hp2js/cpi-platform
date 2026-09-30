import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { eq, ne } from 'drizzle-orm';
import {
  diffForms,
  formDiscardSchema,
  formDraftUpdateSchema,
  summarizeChanges,
  type Cycle,
  type FormValidation,
  type FormVersion,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { write, type Db } from '../database/db';
import { formVersions, obligations } from '../database/schema';
import {
  currentState,
  loadCycle,
  loadForms,
  loadProfiles,
} from '../database/state';
import { Events, usersWithRole } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
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

/** Everything the publication rules read (PRD §7.1, FR03). */
async function formContext(db: Db) {
  const [{ state, profile }, cycle, forms, profiles, started] =
    await Promise.all([
      currentState(db),
      loadCycle(db),
      loadForms(db),
      loadProfiles(db),
      db
        .selectDistinct({ periodId: obligations.periodId })
        .from(obligations)
        .where(ne(obligations.state, 'not_started')),
    ]);
  return {
    businessTime: state.businessTime,
    cycle,
    forms,
    profile,
    profiles,
    startedPeriodIds: new Set(started.map((row) => row.periodId)),
  };
}

/** Reporting form versions (FR03). Drafts are administrator-only. */
@Controller('forms')
export class FormsController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  private async find(db: Db, id: string) {
    const [form] = await db
      .select()
      .from(formVersions)
      .where(eq(formVersions.id, id));
    if (!form) throw notFound();
    return form;
  }

  @Get()
  async list(@CurrentUser() user: User): Promise<FormVersion[]> {
    const forms = await loadForms(this.db);
    return forms
      .filter(
        (form) => user.role === 'administrator' || form.status === 'published',
      )
      .reverse();
  }

  @Get(':formId')
  async get(
    @CurrentUser() user: User,
    @Param('formId') id: string,
  ): Promise<FormVersion> {
    const form = await this.find(this.db, id);
    if (form.status === 'draft' && user.role !== 'administrator')
      throw notFound();
    return form;
  }

  @Get(':formId/validation')
  @Roles('administrator')
  async validation(@Param('formId') id: string): Promise<FormValidation> {
    const form = await this.find(this.db, id);
    const issues = validateForm(form, await formContext(this.db));
    return { valid: issues.length === 0, issues };
  }

  @Put(':formId')
  @Roles('administrator')
  update(
    @CurrentUser() user: User,
    @Param('formId') id: string,
    @Body() body: unknown,
  ) {
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
      const [updated] = await tx
        .update(formVersions)
        .set(next)
        .where(eq(formVersions.id, id))
        .returning();
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

  @Post(':formId/publish')
  @HttpCode(200)
  @Roles('administrator')
  publish(@CurrentUser() user: User, @Param('formId') id: string) {
    return write(this.db, async (tx, businessTime) => {
      const form = await this.find(tx, id);
      if (form.status !== 'draft')
        throw new ApiError(
          409,
          'This version is already published.',
          'already_published',
        );
      const context = await formContext(tx);
      const issues = validateForm(form, context);
      if (issues.length)
        throw new ApiError(
          422,
          'Publication is blocked. Fix the listed issues and try again.',
          'publication_blocked',
          issuesAsFieldErrors(issues),
        );
      // The scoring profile is locked for the cycle from the first publication (PRD §7.1).
      await tx.update(formVersions).set({ weightsLocked: true });
      // Future-period assignments move to the new version; started periods keep theirs.
      for (const other of context.forms)
        if (other.id !== form.id && other.status === 'published')
          await tx
            .update(formVersions)
            .set({
              periodIds: other.periodIds.filter(
                (periodId) => !form.periodIds.includes(periodId),
              ),
            })
            .where(eq(formVersions.id, other.id));
      const changes = changesOf(form, context.forms, context.cycle);
      const quarters = form.periodIds
        .map(periodLabel(context.cycle))
        .join(', ');
      const [published] = await tx
        .update(formVersions)
        .set({
          status: 'published',
          publishedAt: businessTime,
          weights: context.profile.weights,
          changes,
        })
        .where(eq(formVersions.id, form.id))
        .returning();
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
        [
          ...(await usersWithRole(tx, 'institution')),
          ...(await usersWithRole(tx, 'officer')),
          ...(await usersWithRole(tx, 'supervisor')),
        ],
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

  @Post()
  @Roles('administrator')
  create(@CurrentUser() user: User) {
    return write(this.db, async (tx, businessTime) => {
      const context = await formContext(tx);
      if (context.forms.some((form) => form.status === 'draft'))
        throw new ApiError(
          409,
          'Finish or discard the existing draft version first.',
          'draft_exists',
        );
      const latest = context.forms.at(-1);
      if (!latest) throw notFound();
      const [draft] = await tx
        .insert(formVersions)
        .values({
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
        })
        .returning();
      const [withChanges] = await tx
        .update(formVersions)
        .set({ changes: changesOf(draft!, context.forms, context.cycle) })
        .where(eq(formVersions.id, draft!.id))
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        user,
        'form.draft_create',
        { type: 'form', id: draft!.id, version: draft!.version },
        `Draft version ${draft!.version} started from version ${latest.version}`,
      );
      return withChanges;
    });
  }

  /** An unpublished draft can be discarded with a reason; the first version cannot. */
  @Delete(':formId')
  @HttpCode(204)
  @Roles('administrator')
  discard(
    @CurrentUser() user: User,
    @Param('formId') id: string,
    @Body() body: unknown,
  ) {
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
      await tx.delete(formVersions).where(eq(formVersions.id, id));
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
