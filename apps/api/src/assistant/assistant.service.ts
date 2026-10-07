import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ASSISTANT_PROMPT_REVISION,
  assess,
  assistantCheckHints,
  assistantMessages,
  assistantDecisionRequestSchema,
  hiddenKinds,
  type AssistantContext,
  type AssistantRun,
  type AssistantSettings,
  type AssistantView,
} from '@cpi/contracts';
import { assignedInstitutionIds, readableInstitutionIds } from '../auth/scope';
import type { User } from '../auth/sessions';
import { CONFIG, type AppConfig } from '../config';
import { DB, nextId, write, type Database, type Db } from '../database/db';
import { toNairobi } from '../database/schema';
import { Events } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import {
  loadReviewData,
  milestonesOf,
  obligationOf,
  periodOf,
} from '../review/data';
import { Files } from '../storage/files';
import {
  AssistantRepository,
  type RunRow,
  type SuggestionRow,
} from './assistant.repository';
import { extractText } from './extract';
import { providerFrom, type Provider } from './providers';

/**
 * The evidence assistant (PRD §14). On demand, per file, for the assigned officer; supervisors
 * and administrators read. A run happens outside the write lock and outside the request, so the
 * review never waits on a model; nothing here writes decisions, suitability checks or scores.
 * Logs and audit records carry identifiers, model, timings and outcomes, never document text.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger('Assistant');
  private readonly provider: Provider;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly repository: AssistantRepository,
    private readonly files: Files,
    private readonly events: Events,
  ) {
    this.provider = providerFrom(config);
  }

  /** Why the configured provider may not be used, or null (§13, §14 data protection gates). */
  private unavailableReason(): string | null {
    if (this.config.ASSISTANT_PROVIDER === 'deterministic') return null;
    if (!this.config.ASSISTANT_PROVIDER_TERMS)
      return "The provider's data handling is not recorded, so it cannot be enabled.";
    if (!this.config.DEMO_MODE && !this.config.ASSISTANT_REAL_DATA_APPROVED)
      return 'Sending real documents to a provider is not approved.';
    return null;
  }

  private async active(db: Db) {
    return !this.unavailableReason() && (await this.repository.enabled(db));
  }

  /** The submission's file and its review context; 404 outside the caller's scope. */
  private async load(
    db: Db,
    user: User,
    submissionId: string,
    evidenceId: string,
  ) {
    const institutionId = await this.repository.submissionInstitution(
      submissionId,
      db,
    );
    if (
      !institutionId ||
      !(await readableInstitutionIds(db, user)).includes(institutionId)
    )
      throw notFound();
    const data = await loadReviewData(db, [institutionId]);
    const submission = data.submissions.find((row) => row.id === submissionId)!;
    if (!submission.evidenceIds.includes(evidenceId)) throw notFound();
    const item = data.evidence.find((row) => row.id === evidenceId)!;
    const obligation = obligationOf(data, submission);
    const period = periodOf(data, obligation.periodId);
    const institution = data.institutions.find(
      (row) => row.id === institutionId,
    )!;
    const context: AssistantContext = {
      institution: { id: institution.id, name: institution.name },
      period: {
        label: period.label,
        startsOn: period.startsOn,
        endsOn: period.endsOn,
      },
      citations: milestonesOf(data, submission).flatMap((milestone) =>
        (submission.answers.milestones[milestone.id]?.evidence ?? [])
          .filter((reference) => reference.evidenceId === evidenceId)
          .map((reference) => ({
            milestoneCode: milestone.code,
            milestoneTitle: milestone.title,
            passage: reference.passage,
          })),
      ),
    };
    // This version and the versions it replaced: earlier suggestions stay visible as history.
    const versions = new Map<string, number>();
    for (
      let at: typeof item | undefined = item;
      at;
      at = data.evidence.find((row) => row.id === at!.predecessorId)
    )
      versions.set(at.id, at.version);
    const assigned =
      user.role === 'officer' &&
      (await assignedInstitutionIds(db, user.id)).includes(institutionId);
    return { item, context, versions, assigned };
  }

  private stale(run: RunRow) {
    return (
      run.status === 'running' &&
      Date.now() - Date.parse(run.startedAt) >
        this.config.ASSISTANT_TIMEOUT_MS + 15_000
    );
  }

  private toRun(
    run: RunRow,
    suggestions: SuggestionRow[],
    version: number,
  ): AssistantRun {
    // A run lost to a restart reads as timed out rather than waiting forever.
    const lost = this.stale(run);
    const result: Omit<AssistantRun, 'checkHints'> = {
      id: run.id,
      evidenceId: run.evidenceId,
      evidenceVersion: version,
      status: lost ? 'failed' : run.status,
      message: lost ? assistantMessages.timed_out : run.message,
      provider: run.provider,
      model: run.model,
      promptRevision: run.promptRevision,
      language: run.language,
      unit: run.unit,
      unreadablePages: run.unreadablePages,
      discarded: run.discarded,
      hiddenKinds: run.hiddenKinds,
      requestedBy: run.requestedBy,
      requestedAt: run.requestedAt,
      durationMs: run.durationMs,
      suggestions: suggestions.map((row) => ({
        id: row.id,
        kind: row.kind,
        finding: row.finding,
        milestoneCode: row.milestoneCode,
        statement: row.statement,
        quote: row.quote,
        page: row.page,
        decision: row.decision,
      })),
    };
    return { ...result, checkHints: assistantCheckHints(result) };
  }

  async view(
    user: User,
    submissionId: string,
    evidenceId: string,
    db: Db = this.db,
  ): Promise<AssistantView> {
    const { assigned, versions } = await this.load(
      db,
      user,
      submissionId,
      evidenceId,
    );
    const enabled = await this.active(db);
    const runs = await this.repository.runs([...versions.keys()], db);
    return {
      enabled,
      canRun: enabled && assigned,
      canDecide: assigned,
      runs: runs.map(({ run, suggestions }) =>
        this.toRun(run, suggestions, versions.get(run.evidenceId)!),
      ),
    };
  }

  /** Starts a run, or reuses a finished one for the same file version, model and prompt. */
  async run(
    user: User,
    submissionId: string,
    evidenceId: string,
  ): Promise<AssistantView> {
    const started = await write(this.db, async (tx, businessTime) => {
      const { item, context, assigned } = await this.load(
        tx,
        user,
        submissionId,
        evidenceId,
      );
      if (!assigned)
        throw new ApiError(
          403,
          'Only the assigned officer can ask the evidence assistant.',
          'forbidden',
        );
      if (!(await this.active(tx)))
        throw new ApiError(
          409,
          'The evidence assistant is turned off.',
          'assistant_off',
        );
      const previous = await this.repository.runs([evidenceId], tx);
      const reusable = previous.some(
        ({ run }) =>
          (['completed', 'declined'].includes(run.status) &&
            run.provider === this.provider.name &&
            run.model === this.provider.model &&
            run.promptRevision === ASSISTANT_PROMPT_REVISION) ||
          (run.status === 'running' && !this.stale(run)),
      );
      if (reusable) return null;
      const id = await nextId(tx, 'arun');
      await this.repository.insertRun(
        {
          id,
          evidenceId,
          status: 'running',
          provider: this.provider.name,
          model: this.provider.model,
          promptRevision: ASSISTANT_PROMPT_REVISION,
          requestedBy: user.displayName,
          requestedAt: businessTime,
          startedAt: toNairobi(new Date()),
        },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'assistant.run',
        { type: 'evidence', id: evidenceId, version: item.version },
        `Evidence assistant run ${id} requested (${this.provider.name}, ${this.provider.model}, ${ASSISTANT_PROMPT_REVISION})`,
      );
      return { id, item, context };
    });
    if (started) void this.execute(started.id, started.item, started.context);
    return this.view(user, submissionId, evidenceId);
  }

  private async execute(
    runId: string,
    item: Parameters<Files['read']>[0] & { mimeType: string },
    context: AssistantContext,
  ) {
    const begin = Date.now();
    const signal = AbortSignal.timeout(this.config.ASSISTANT_TIMEOUT_MS);
    const finish = async (
      changes: Partial<RunRow>,
      suggestions: Omit<
        SuggestionRow,
        'id' | 'seq' | 'runId' | 'decision'
      >[] = [],
    ) => {
      await write(this.db, async (tx) => {
        // A reset or a timed-out read may have replaced the run meanwhile.
        if ((await this.repository.run(runId, tx))?.status !== 'running')
          return;
        await this.repository.updateRun(
          runId,
          { ...changes, durationMs: Date.now() - begin },
          tx,
        );
        const rows = [];
        for (const suggestion of suggestions)
          rows.push({ ...suggestion, id: await nextId(tx, 'asug'), runId });
        await this.repository.insertSuggestions(rows, tx);
      });
      this.logger.log({
        event: 'assistant.run',
        runId,
        evidenceId: item.id,
        provider: this.provider.name,
        model: this.provider.model,
        outcome: changes.status,
        suggestions: suggestions.length,
        durationMs: Date.now() - begin,
      });
    };
    try {
      const bytes = await this.files.read(item);
      if (!bytes)
        return await finish({
          status: 'declined',
          message: assistantMessages.no_contents,
        });
      const extraction = await extractText(
        bytes,
        item.mimeType,
        this.config.ASSISTANT_MAX_PAGES,
      );
      if (!extraction.ok)
        return await finish({
          status: 'declined',
          message: assistantMessages[extraction.reason],
        });
      const { document } = extraction;
      const proposal = await Promise.race([
        this.provider.propose(document, context, signal),
        new Promise<never>((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          }),
        ),
      ]);
      const result = assess(document, context, proposal.candidates);
      result.discarded.untraceable += proposal.malformed;
      const hidden = hiddenKinds(
        result.language,
        this.config.ASSISTANT_HIDDEN_KINDS,
        this.config.ASSISTANT_OTHER_LANGUAGE_KINDS,
      );
      await finish(
        {
          status: 'completed',
          language: result.language,
          unit: document.unit,
          unreadablePages: result.unreadablePages,
          discarded: result.discarded,
          hiddenKinds: hidden,
        },
        result.suggestions.filter(
          (suggestion) => !hidden.includes(suggestion.kind),
        ),
      );
    } catch {
      // The error may quote the provider's reply; record only the outcome.
      await finish({
        status: 'failed',
        message: signal.aborted
          ? assistantMessages.timed_out
          : assistantMessages.failed,
      }).catch(() => undefined);
    }
  }

  /** Accept, amend or dismiss one suggestion; it changes nothing else in the review. */
  async decide(
    user: User,
    submissionId: string,
    suggestionId: string,
    body: unknown,
  ): Promise<AssistantView> {
    const evidenceId = await write(this.db, async (tx, businessTime) => {
      const found = await this.repository.suggestion(suggestionId, tx);
      if (!found) throw notFound();
      const { assigned } = await this.load(
        tx,
        user,
        submissionId,
        found.run.evidenceId,
      );
      if (!assigned)
        throw new ApiError(
          403,
          'Only the assigned officer can decide on suggestions.',
          'forbidden',
        );
      const parsed = assistantDecisionRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Choose accept, amend or dismiss, with your wording when amending.',
          'invalid_request',
          Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join('.'),
              issue.message,
            ]),
          ),
        );
      await this.repository.decide(
        suggestionId,
        {
          outcome: parsed.data.outcome,
          note: parsed.data.outcome === 'amended' ? parsed.data.note : '',
          by: user.displayName,
          at: businessTime,
        },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'assistant.decision',
        { type: 'assistant_suggestion', id: suggestionId },
        `${found.suggestion.kind} suggestion from run ${found.run.id} ${parsed.data.outcome}`,
      );
      return found.run.evidenceId;
    });
    return this.view(user, submissionId, evidenceId);
  }

  async settings(): Promise<AssistantSettings> {
    const reason = this.unavailableReason();
    return {
      enabled: await this.repository.enabled(),
      available: !reason,
      unavailableReason: reason,
      provider: this.provider.name,
      model: this.provider.model,
      endpoint: this.provider.endpoint,
      promptRevision: ASSISTANT_PROMPT_REVISION,
      termsRef: this.config.ASSISTANT_PROVIDER_TERMS || null,
      hiddenKinds: this.config.ASSISTANT_HIDDEN_KINDS,
      otherLanguageKinds: this.config.ASSISTANT_OTHER_LANGUAGE_KINDS,
      maxPages: this.config.ASSISTANT_MAX_PAGES,
      timeoutMs: this.config.ASSISTANT_TIMEOUT_MS,
      usage: await this.repository.usage(),
    };
  }

  async setEnabled(user: User, enabled: boolean): Promise<AssistantSettings> {
    if (enabled && this.unavailableReason())
      throw new ApiError(
        409,
        this.unavailableReason()!,
        'assistant_unavailable',
      );
    await write(this.db, async (tx, businessTime) => {
      await this.repository.setEnabled(enabled, tx);
      await this.events.audit(
        tx,
        businessTime,
        user,
        'assistant.settings',
        { type: 'assistant', id: 'deployment' },
        `Evidence assistant turned ${enabled ? 'on' : 'off'} (${this.provider.name}, ${this.provider.model})`,
      );
    });
    return this.settings();
  }
}
