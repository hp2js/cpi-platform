import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { eq, ne } from 'drizzle-orm';
import {
  formDraftUpdateSchema,
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
  update(@Param('formId') id: string, @Body() body: unknown) {
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
      const { profile } = await currentState(tx);
      const [updated] = await tx
        .update(formVersions)
        .set({
          ...parsed.data,
          // A snapshot of the cycle profile's weights; they are set in Settings, not here.
          weights: profile.weights,
          updatedAt: businessTime,
        })
        .where(eq(formVersions.id, id))
        .returning();
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
      const [published] = await tx
        .update(formVersions)
        .set({
          status: 'published',
          publishedAt: businessTime,
          weights: context.profile.weights,
        })
        .where(eq(formVersions.id, form.id))
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        user,
        'form.publish',
        { type: 'form', id: form.id, version: form.version },
        `Version ${form.version} for ${form.periodIds.length} period(s)`,
      );
      await this.events.notify(
        tx,
        businessTime,
        `${form.id}:published`,
        'form.published',
        [
          ...(await usersWithRole(tx, 'institution')),
          ...(await usersWithRole(tx, 'officer')),
        ],
        {
          title: `Reporting form version ${form.version} published`,
          body: 'The quarterly progress report form is available for the assigned periods.',
          link: (recipient) =>
            recipient.role === 'institution' ? '/institution' : '/officer',
        },
      );
      return published;
    });
  }

  @Post()
  @Roles('administrator')
  create() {
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
        })
        .returning();
      return draft;
    });
  }
}
