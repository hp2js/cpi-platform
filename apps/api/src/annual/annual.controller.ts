import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { Response } from 'express';
import {
  closeNonresponseRequestSchema,
  correctionRequestSchema,
  extensionRequestSchema,
  publishRequestSchema,
  toCsv,
  type AnnualEvaluation,
  type AnnualOverview,
  type ConsolidatedReport,
  type InstitutionResults,
  type Oversight,
} from '@cpi/contracts';
import { assignedInstitutionIds, readableInstitutionIds } from '../auth/scope';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { nextId, write, type Db } from '../database/db';
import {
  closures,
  corrections,
  extensions,
  obligations,
  publications,
} from '../database/schema';
import { Events, assignedOfficers, institutionUsers } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { effectiveCutoff } from '../review/clarifications';
import { periodOf } from '../review/data';
import {
  consolidated,
  cutoffPassed,
  evaluate,
  exportHeader,
  exportRows,
  loadAnnualData,
  overview,
  oversight,
  toPublished,
} from './data';

function sendCsv(response: Response, name: string, body: string) {
  response
    .type('text/csv; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="${name}"`)
    .send(body);
}

const allInstitutions = async (db: Db) =>
  (await db.query.institutions.findMany({ columns: { id: true } })).map(
    (row) => row.id,
  );

/** Annual evaluation, publication and corrections (PRD §7.4, §7.6, FR12–FR13, FR16). */
@Controller()
export class AnnualController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  private async overviewFor(db: Db, user: User): Promise<AnnualOverview> {
    const readable = await readableInstitutionIds(db, user);
    return overview(await loadAnnualData(db, readable), readable);
  }

  @Get('annual')
  @Roles('supervisor', 'administrator', 'officer')
  annual(@CurrentUser() user: User) {
    return this.overviewFor(this.db, user);
  }

  @Post('annual/publish')
  @HttpCode(200)
  @Roles('administrator')
  publish(@CurrentUser() user: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const parsed = publishRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Choose at least one institution to publish.',
          'invalid_request',
        );
      const data = await loadAnnualData(tx, parsed.data.institutionIds);
      if (!cutoffPassed(data))
        throw new ApiError(
          409,
          'Results can be published only after the evaluation cutoff has passed.',
          'cutoff_not_passed',
        );
      if (
        parsed.data.institutionIds.some(
          (id) =>
            !data.institutions.some((institution) => institution.id === id),
        )
      )
        throw notFound();
      const evaluations = parsed.data.institutionIds.map((id) =>
        evaluate(data, id),
      );
      const list = (items: AnnualEvaluation[]) =>
        items.map((evaluation) => evaluation.institutionId).join(', ');
      const blocked = evaluations.filter(
        (evaluation) => !evaluation.releasable,
      );
      if (blocked.length)
        throw new ApiError(
          422,
          `Not ready for release: ${list(blocked)}.`,
          'not_releasable',
        );
      const unchanged = evaluations.filter(
        (evaluation) =>
          evaluation.publication &&
          !evaluation.publication.stale &&
          !evaluation.correction,
      );
      if (unchanged.length)
        throw new ApiError(
          409,
          `Already published and unchanged: ${list(unchanged)}.`,
          'already_published',
        );
      const needsCase = evaluations.filter(
        (evaluation) => evaluation.publication && !evaluation.correction,
      );
      if (needsCase.length)
        throw new ApiError(
          409,
          `A published result can change only through a correction case: ${list(needsCase)}.`,
          'correction_required',
        );
      const batchId = await nextId(tx, 'batch');
      for (const evaluation of evaluations) {
        const previous = evaluation.publication;
        const correction = evaluation.correction;
        const id = await nextId(tx, 'pub');
        await tx.insert(publications).values({
          id,
          institutionId: evaluation.institutionId,
          version: (previous?.version ?? 0) + 1,
          batchId,
          publishedAt: businessTime,
          publishedBy: user.displayName,
          supersededBy: null,
          correctionReason: correction?.reason ?? null,
          // A release keeps the profile it was scored with, even after a later run changes it.
          profileName: data.profile.name,
          evaluation: {
            institutionId: evaluation.institutionId,
            institutionName: evaluation.institutionName,
            officerName: evaluation.officerName,
            quarters: evaluation.quarters,
            foundations: evaluation.foundations,
            weights: evaluation.weights,
            total: evaluation.total,
          },
          points:
            evaluation.total.status === 'calculated'
              ? evaluation.total.points
              : '',
        });
        // The earlier release stays accessible as superseded (§7.4, AT20).
        if (previous)
          await tx
            .update(publications)
            .set({ supersededBy: id })
            .where(eq(publications.id, previous.id));
        if (correction)
          await tx
            .update(corrections)
            .set({ closedAt: businessTime })
            .where(eq(corrections.id, correction.id));
        await this.events.audit(
          tx,
          businessTime,
          user,
          previous ? 'publication.correct' : 'publication.publish',
          { type: 'publication', id, version: (previous?.version ?? 0) + 1 },
          `${evaluation.institutionId} in ${batchId}`,
        );
        await this.events.notify(
          tx,
          businessTime,
          id,
          previous ? 'result.corrected' : 'result.published',
          await institutionUsers(tx, evaluation.institutionId),
          {
            title: previous
              ? `Corrected ${data.cycle.label} result published`
              : `Your ${data.cycle.label} result is published`,
            body: previous
              ? 'A corrected result replaces the earlier release, which remains available as superseded.'
              : 'Your annual evaluation and its explanation are now available.',
            link: '/institution/results',
          },
        );
      }
      return this.overviewFor(tx, user);
    });
  }

  @Post('annual/extensions')
  @HttpCode(200)
  @Roles('administrator')
  extend(@CurrentUser() user: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const parsed = extensionRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Give the new date, who authorized it and a reason of at least 10 characters.',
          'invalid_request',
          Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join('.'),
              issue.message,
            ]),
          ),
        );
      const { institutionId, untilDate, reason, authorizedBy } = parsed.data;
      const data = await loadAnnualData(tx, [institutionId]);
      if (!data.institutions.some((item) => item.id === institutionId))
        throw notFound();
      const until = `${untilDate}T23:59:59+03:00`;
      if (Date.parse(until) <= Date.parse(data.cycle.evaluationCutoff))
        throw new ApiError(
          422,
          'An extension must end after the evaluation cutoff.',
          'invalid_request',
          { untilDate: 'Choose a date after the evaluation cutoff.' },
        );
      // The system never shortens a response window (§7.3).
      const latestWindow = data.clarifications
        .filter(
          (clarification) => clarification.institutionId === institutionId,
        )
        .reduce(
          (latest, clarification) =>
            Math.max(latest, Date.parse(clarification.responseDueAt)),
          0,
        );
      if (Date.parse(until) < latestWindow)
        throw new ApiError(
          422,
          'The extension cannot end before an open clarification window does.',
          'invalid_request',
          {
            untilDate: `Choose ${new Date(latestWindow + 3 * 3_600_000).toISOString().slice(0, 10)} or later.`,
          },
        );
      // One current extension per institution; the audit log keeps earlier ones.
      await tx
        .delete(extensions)
        .where(eq(extensions.institutionId, institutionId));
      await tx.insert(extensions).values({
        institutionId,
        until,
        reason,
        authorizedBy,
        recordedBy: user.displayName,
        recordedAt: businessTime,
      });
      await this.events.audit(
        tx,
        businessTime,
        user,
        'evaluation.extension',
        { type: 'institution', id: institutionId },
        `Extended to ${untilDate}, authorized by ${authorizedBy}: ${reason}`,
      );
      await this.events.notify(
        tx,
        businessTime,
        await nextId(tx, `${institutionId}:extension`),
        'evaluation.extension',
        [
          ...(await institutionUsers(tx, institutionId)),
          ...(await assignedOfficers(tx, institutionId)),
        ],
        {
          title: `Evaluation extended to ${untilDate} for ${institutionId}`,
          body: 'The extension lets evidence and review finish. It does not change other deadlines or lateness.',
          link: (recipient) =>
            recipient.role === 'institution'
              ? '/institution/clarifications'
              : `/officer/institutions/${institutionId}`,
        },
      );
      return evaluate(await loadAnnualData(tx, [institutionId]), institutionId);
    });
  }

  @Post('annual/corrections')
  @Roles('administrator')
  openCorrection(@CurrentUser() user: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const parsed = correctionRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Choose the quarter and give a reason of at least 10 characters.',
          'invalid_request',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      const { institutionId, periodId } = parsed.data;
      const [current] = await tx
        .select({ id: publications.id })
        .from(publications)
        .where(
          and(
            eq(publications.institutionId, institutionId),
            isNull(publications.supersededBy),
          ),
        );
      if (!current)
        throw new ApiError(
          409,
          'Only a published result needs a correction case; before publication the officer can reopen directly.',
          'not_published',
        );
      const [open] = await tx
        .select({ id: corrections.id })
        .from(corrections)
        .where(
          and(
            eq(corrections.institutionId, institutionId),
            isNull(corrections.closedAt),
          ),
        );
      if (open)
        throw new ApiError(
          409,
          'A correction case is already open for this institution.',
          'correction_open',
        );
      const id = await nextId(tx, 'corr');
      const reason = parsed.data.reason.trim();
      await tx.insert(corrections).values({
        id,
        institutionId,
        periodId,
        reason,
        openedBy: user.displayName,
        openedAt: businessTime,
        closedAt: null,
      });
      const data = await loadAnnualData(tx, [institutionId]);
      const label = periodOf(data, periodId).label;
      await this.events.audit(
        tx,
        businessTime,
        user,
        'correction.open',
        { type: 'correction', id },
        `${institutionId} ${label}: ${reason}`,
      );
      await this.events.notify(
        tx,
        businessTime,
        id,
        'correction.opened',
        await assignedOfficers(tx, institutionId),
        {
          title: `Correction case opened: ${institutionId} ${label}`,
          body: 'Reopen the finalized review, record the corrected decision and finalize; the administrator then publishes a new version.',
          link: '/officer',
        },
      );
      return this.overviewFor(tx, user);
    });
  }

  @Get('annual/report')
  @Roles('supervisor', 'administrator')
  async report(): Promise<ConsolidatedReport> {
    return consolidated(
      await loadAnnualData(this.db, await allInstitutions(this.db)),
    );
  }

  @Get('annual/report.csv')
  @Roles('supervisor', 'administrator')
  async reportCsv(@Res() response: Response) {
    const data = await loadAnnualData(this.db, await allInstitutions(this.db));
    sendCsv(
      response,
      'cpi-consolidated-results.csv',
      toCsv(
        exportHeader,
        exportRows(data.cycle.id, consolidated(data).released),
      ),
    );
  }

  /** Institution: only its own released results; nothing numerical before release (AT18, AT19). */
  @Get('results')
  @Roles('institution')
  async results(@CurrentUser() user: User): Promise<InstitutionResults> {
    const data = await loadAnnualData(this.db, [user.institutionId ?? '']);
    const results = data.publications
      .filter((publication) => publication.institutionId === user.institutionId)
      .map((publication) => toPublished(data, publication))
      .reverse();
    return {
      released: results.length > 0,
      message: results.length
        ? 'Your published results are shown below.'
        : 'Results are published after annual evaluation. Until then you see the status of each report and any feedback.',
      results,
    };
  }

  @Get('results/export.csv')
  @Roles('institution')
  async resultsCsv(@CurrentUser() user: User, @Res() response: Response) {
    const data = await loadAnnualData(this.db, [user.institutionId ?? '']);
    const results = data.publications
      .filter(
        (publication) =>
          publication.institutionId === user.institutionId &&
          publication.supersededBy === null,
      )
      .map((publication) => toPublished(data, publication));
    if (!results.length)
      throw new ApiError(
        404,
        'There is no published result to export yet.',
        'not_published',
      );
    sendCsv(
      response,
      `cpi-result-${user.institutionId}.csv`,
      toCsv(exportHeader, exportRows(data.cycle.id, results)),
    );
  }

  @Post('obligations/:obligationId/close-nonresponse')
  @HttpCode(200)
  @Roles('officer', 'supervisor', 'administrator')
  closeNonresponse(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
    @Body() body: unknown,
  ): Promise<AnnualEvaluation> {
    return write(this.db, async (tx, businessTime) => {
      const [obligation] = await tx
        .select()
        .from(obligations)
        .where(eq(obligations.id, id));
      if (
        !obligation ||
        !(await readableInstitutionIds(tx, user)).includes(
          obligation.institutionId,
        )
      )
        throw notFound();
      if (
        user.role !== 'officer' ||
        !(await assignedInstitutionIds(tx, user.id)).includes(
          obligation.institutionId,
        )
      )
        throw new ApiError(
          403,
          'Only the assigned officer records dispositions.',
          'forbidden',
        );
      const parsed = closeNonresponseRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Give a reason of at least 10 characters.',
          'reason_required',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      // The scheduler never decides this: the officer records it, and only after the cutoff (§7.6).
      if (
        Date.parse(businessTime) <=
        (await effectiveCutoff(tx, obligation.institutionId))
      )
        throw new ApiError(
          409,
          'Non-response can be recorded only after the evaluation cutoff.',
          'cutoff_not_passed',
        );
      if (obligation.state !== 'not_started' && obligation.state !== 'draft')
        throw new ApiError(
          409,
          'A report was submitted for this quarter; review it instead.',
          'submitted',
        );
      const reason = parsed.data.reason.trim();
      await tx
        .update(obligations)
        .set({ state: 'closed_without_submission' })
        .where(eq(obligations.id, id));
      await tx.insert(closures).values({
        obligationId: id,
        reason,
        by: user.displayName,
        at: businessTime,
      });
      await this.events.audit(
        tx,
        businessTime,
        user,
        'obligation.close_nonresponse',
        { type: 'obligation', id },
        reason,
      );
      const data = await loadAnnualData(tx, [obligation.institutionId]);
      await this.events.notify(
        tx,
        businessTime,
        `${id}:closed`,
        'obligation.closed',
        await institutionUsers(tx, obligation.institutionId),
        {
          title: `${periodOf(data, obligation.periodId).label} closed without submission`,
          body: 'Your officer recorded non-response for this quarter after the evaluation cutoff.',
          link: '/institution',
        },
      );
      return evaluate(data, obligation.institutionId);
    });
  }

  /** Dashboard metrics as defined in PRD §4.3, filtered to the caller's authorized scope. */
  @Get('oversight')
  @Roles('supervisor', 'administrator')
  async oversight(
    @CurrentUser() user: User,
    @Query() query: Record<string, string | undefined>,
  ): Promise<Oversight> {
    const readable = await readableInstitutionIds(this.db, user);
    return oversight(await loadAnnualData(this.db, readable), readable, {
      periodId: query.periodId || null,
      institutionId: query.institutionId || null,
      officerId: query.officerId || null,
    });
  }
}
