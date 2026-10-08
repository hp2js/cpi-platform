import { Inject, Injectable } from '@nestjs/common';
import {
  closeNonresponseRequestSchema,
  consolidatedReportDocument,
  institutionReportDocument,
  renderPdf,
  toCsv,
  type AnnualEvaluation,
  type AnnualOverview,
  type ConsolidatedReport,
  type CorrectionRequest,
  type ExtensionRequest,
  type InstitutionResults,
  type Oversight,
  type PublishRequest,
} from '@cpi/contracts';
import type { QueryFilters } from '../http/validation.pipe';
import { assignedInstitutionIds, readableInstitutionIds } from '../auth/scope';
import type { User } from '../auth/sessions';
import { DB, nextId, write, type Database, type Db } from '../database/db';
import { Events, assignedOfficers, institutionUsers } from '../events/events';
import {
  ReportIdentityService,
  reportIdentityOf,
} from '../cycle/report-identity.service';
import { ApiError, notFound } from '../http/api-error';
import { effectiveCutoff } from '../review/clarifications';
import { obligationById } from '../reporting/report';
import { periodOf } from '../review/data';
import { AnnualRepository } from './annual.repository';
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

/** Annual evaluation, publication and corrections (PRD §7.4, §7.6, FR12–FR13, FR16). */
@Injectable()
export class AnnualService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: AnnualRepository,
    private readonly events: Events,
    private readonly identity: ReportIdentityService,
  ) {}

  /**
   * One published version's annual report as a PDF (HP2-64), generated from the release itself.
   * An institution gets only its own; staff only within their scope. Downloads are audited.
   */
  async resultPdf(user: User, publicationId: string) {
    const scope = await readableInstitutionIds(this.db, user);
    const data = await loadAnnualData(this.db, scope);
    const publication = data.publications.find(
      (candidate) =>
        candidate.id === publicationId &&
        scope.includes(candidate.institutionId),
    );
    if (!publication) throw notFound();
    const result = toPublished(data, publication);
    const next = data.publications.find(
      (candidate) => candidate.id === publication.supersededBy,
    );
    const generated = institutionReportDocument(result, {
      cycleLabel: data.cycle.label,
      generatedAt: data.businessTime,
      images: await this.identity.imagesFor(result.identity),
      supersededBy: next
        ? {
            version: next.version,
            publishedAt: next.publishedAt,
            reason: next.correctionReason,
          }
        : null,
    });
    await this.audited(
      user,
      { type: 'publication', id: publication.id, version: publication.version },
      `Downloaded ${generated.fileName}`,
    );
    return {
      bytes: renderPdf(generated.document),
      fileName: generated.fileName,
    };
  }

  /** The consolidated report as a PDF, for supervisors and administrators (HP2-64). */
  async reportPdf(user: User) {
    const scope = await readableInstitutionIds(this.db, user);
    const data = await loadAnnualData(this.db, scope);
    const report = consolidated(data, scope);
    const identity =
      report.released.at(-1)?.identity ?? (await this.identity.current());
    const generated = consolidatedReportDocument(report, identity, {
      generatedAt: data.businessTime,
      images: await this.identity.imagesFor(identity),
    });
    await this.audited(
      user,
      { type: 'publication', id: report.batches.at(-1)?.batchId ?? 'none' },
      `Downloaded ${generated.fileName}`,
    );
    return {
      bytes: renderPdf(generated.document),
      fileName: generated.fileName,
    };
  }

  private audited(
    user: User,
    object: { type: string; id: string; version?: number },
    summary: string,
  ) {
    return write(this.db, (tx, businessTime) =>
      this.events.audit(
        tx,
        businessTime,
        user,
        'report.download',
        object,
        summary,
      ),
    );
  }

  private async overviewFor(db: Db, user: User): Promise<AnnualOverview> {
    const readable = await readableInstitutionIds(db, user);
    return overview(await loadAnnualData(db, readable), readable);
  }

  annual(user: User) {
    return this.overviewFor(this.db, user);
  }

  publish(user: User, input: PublishRequest) {
    return write(this.db, async (tx, businessTime) => {
      const data = await loadAnnualData(tx, input.institutionIds);
      if (!cutoffPassed(data))
        throw new ApiError(
          409,
          'Results can be published only after the evaluation cutoff has passed.',
          'cutoff_not_passed',
        );
      if (
        input.institutionIds.some(
          (id) =>
            !data.institutions.some((institution) => institution.id === id),
        )
      )
        throw notFound();
      const evaluations = input.institutionIds.map((id) => evaluate(data, id));
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
      // Each release keeps the report identity in force now; a correction is a new version
      // released under the identity in force at that time (HP2-65).
      const identity = await reportIdentityOf(tx);
      for (const evaluation of evaluations) {
        const previous = evaluation.publication;
        const correction = evaluation.correction;
        const id = await nextId(tx, 'pub');
        await this.repository.publish(
          {
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
            identity,
          },
          previous?.id,
          tx,
        );
        if (correction)
          await this.repository.closeCorrection(
            correction.id,
            businessTime,
            tx,
          );
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

  extend(user: User, input: ExtensionRequest) {
    return write(this.db, async (tx, businessTime) => {
      const { institutionId, untilDate, reason, authorizedBy } = input;
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
      await this.repository.replaceExtension(
        {
          institutionId,
          until,
          reason,
          authorizedBy,
          recordedBy: user.displayName,
          recordedAt: businessTime,
        },
        tx,
      );
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

  openCorrection(user: User, input: CorrectionRequest) {
    return write(this.db, async (tx, businessTime) => {
      const { institutionId, periodId } = input;
      if (!(await this.repository.hasCurrentPublication(institutionId, tx)))
        throw new ApiError(
          409,
          'Only a published result needs a correction case; before publication the officer can reopen directly.',
          'not_published',
        );
      if (await this.repository.hasOpenCorrection(institutionId, tx))
        throw new ApiError(
          409,
          'A correction case is already open for this institution.',
          'correction_open',
        );
      const id = await nextId(tx, 'corr');
      const reason = input.reason.trim();
      await this.repository.insertCorrection(
        {
          id,
          institutionId,
          periodId,
          reason,
          openedBy: user.displayName,
          openedAt: businessTime,
          closedAt: null,
        },
        tx,
      );
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

  async report(user: User): Promise<ConsolidatedReport> {
    const scope = await readableInstitutionIds(this.db, user);
    return consolidated(await loadAnnualData(this.db, scope), scope);
  }

  async reportCsv(user: User): Promise<string> {
    const scope = await readableInstitutionIds(this.db, user);
    const data = await loadAnnualData(this.db, scope);
    return toCsv(
      exportHeader,
      exportRows(data.cycle.id, consolidated(data, scope).released),
    );
  }

  /** Institution: only its own released results; nothing numerical before release (AT18, AT19). */
  async results(user: User): Promise<InstitutionResults> {
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

  async resultsCsv(user: User): Promise<string> {
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
    return toCsv(exportHeader, exportRows(data.cycle.id, results));
  }

  closeNonresponse(
    user: User,
    id: string,
    body: unknown,
  ): Promise<AnnualEvaluation> {
    return write(this.db, async (tx, businessTime) => {
      const obligation = await obligationById(tx, id);
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
      await this.repository.closeWithoutSubmission(
        { obligationId: id, reason, by: user.displayName, at: businessTime },
        tx,
      );
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
  async oversight(user: User, query: QueryFilters): Promise<Oversight> {
    const readable = await readableInstitutionIds(this.db, user);
    return oversight(
      await loadAnnualData(this.db, readable),
      readable,
      user.role === 'administrator',
      {
        periodId: query.periodId || null,
        institutionId: query.institutionId || null,
        officerId: query.officerId || null,
      },
    );
  }
}
