import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ASSISTANT_CHAT_MAX_REPLY,
  ASSISTANT_PROMPT_REVISION,
  assess,
  assistantChatRequestSchema,
  assistantCheckHints,
  assistantMessages,
  assistantDecisionRequestSchema,
  hiddenKinds,
  type AssistantChat,
  type AssistantChatContext,
  type AssistantContext,
  type AssistantRun,
  type AssistantSettings,
  type AssistantView,
} from '@cpi/contracts';
import { assignedInstitutionIds, readableInstitutionIds } from '../auth/scope';
import type { User } from '../auth/sessions';
import { CONFIG, type AppConfig } from '../config';
import {
  DB,
  nextId,
  write,
  type Database,
  type Db,
  type Tx,
} from '../database/db';
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
  type MessageRow,
  type RunRow,
  type SuggestionRow,
} from './assistant.repository';
import { extractText } from './extract';
import { providerFrom, type Provider } from './providers';

type Item = Parameters<Files['read']>[0] & {
  id: string;
  version: number;
  fileName: string;
  mimeType: string;
};

/** The HTTP status a provider failed with (429: rate limit or no credits; 401: bad key), or null. */
const providerStatus = (error: unknown) =>
  typeof (error as { status?: unknown })?.status === 'number'
    ? (error as { status: number }).status
    : null;

/** The provider's answer, or the signal's abort reason once time is up. */
const withinTime = <T>(work: Promise<T>, signal: AbortSignal) =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      }),
    ),
  ]);

/**
 * The evidence assistant (PRD §14). Each file is read when the report is submitted (and again
 * on the assigned officer's request); the officer accepts, amends or dismisses every
 * suggestion, and can ask about the whole submission in a chat. Supervisors and administrators
 * read. Runs and replies happen outside the write lock, so the review never waits on a model;
 * nothing here writes decisions, suitability checks or scores. Logs and audit records carry
 * identifiers, model, timings and outcomes, never document text, questions or replies.
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

  /** The submission and its review context; 404 outside the caller's scope. */
  private async scope(db: Db, user: User, submissionId: string) {
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
    const obligation = obligationOf(data, submission);
    const period = periodOf(data, obligation.periodId);
    const institution = data.institutions.find(
      (row) => row.id === institutionId,
    )!;
    const citations = milestonesOf(data, submission).flatMap((milestone) =>
      (submission.answers.milestones[milestone.id]?.evidence ?? []).map(
        (reference) => ({
          evidenceId: reference.evidenceId,
          milestoneCode: milestone.code,
          milestoneTitle: milestone.title,
          passage: reference.passage,
        }),
      ),
    );
    const assigned =
      user.role === 'officer' &&
      (await assignedInstitutionIds(db, user.id)).includes(institutionId);
    const items = submission.evidenceIds.map((id) =>
      data.evidence.find((row) => row.id === id)!,
    );
    return {
      data,
      items,
      assigned,
      context: {
        institution: { id: institution.id, name: institution.name },
        period: {
          label: period.label,
          startsOn: period.startsOn,
          endsOn: period.endsOn,
        },
        citations,
      },
    };
  }

  /** One file of the submission, the context for it, and its earlier versions. */
  private file(
    { data, items, assigned, context }: Awaited<ReturnType<typeof this.scope>>,
    evidenceId: string,
  ) {
    const item = items.find((row) => row.id === evidenceId);
    if (!item) throw notFound();
    const fileContext: AssistantContext = {
      ...context,
      citations: context.citations
        .filter((citation) => citation.evidenceId === evidenceId)
        .map(({ evidenceId: _, ...citation }) => citation),
    };
    // This version and the versions it replaced: earlier suggestions stay visible as history.
    const versions = new Map<string, number>();
    for (
      let at: typeof item | undefined = item;
      at;
      at = data.evidence.find((row) => row.id === at!.predecessorId)
    )
      versions.set(at.id, at.version);
    return { item, context: fileContext, versions, assigned };
  }

  private async load(
    db: Db,
    user: User,
    submissionId: string,
    evidenceId: string,
  ) {
    return this.file(await this.scope(db, user, submissionId), evidenceId);
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

  /**
   * Records a new run for this file version unless a finished one for the same provider, model
   * and prompt (or one still running) can be reused. Call inside `write()`; execute after it.
   */
  private async start(
    tx: Tx,
    businessTime: string,
    actor: User,
    requestedBy: string,
    item: Item,
    context: AssistantContext,
  ) {
    const previous = await this.repository.runs([item.id], tx);
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
        evidenceId: item.id,
        status: 'running',
        provider: this.provider.name,
        model: this.provider.model,
        promptRevision: ASSISTANT_PROMPT_REVISION,
        requestedBy,
        requestedAt: businessTime,
        startedAt: toNairobi(new Date()),
      },
      tx,
    );
    await this.events.audit(
      tx,
      businessTime,
      actor,
      'assistant.run',
      { type: 'evidence', id: item.id, version: item.version },
      `Evidence assistant run ${id} ${actor.role === 'institution' ? 'started on submission' : 'requested'} (${this.provider.name}, ${this.provider.model}, ${ASSISTANT_PROMPT_REVISION})`,
    );
    return { id, item, context };
  }

  /** On the officer's request: a first run, or a retry after a failure. */
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
      return this.start(
        tx,
        businessTime,
        user,
        user.displayName,
        item,
        context,
      );
    });
    if (started) void this.execute(started.id, started.item, started.context);
    return this.view(user, submissionId, evidenceId);
  }

  /**
   * Reads every file of a new submission in the background, so suggestions are ready when the
   * officer opens the review. Does nothing while the assistant is off; never fails the submission.
   */
  async reviewSubmission(user: User, submissionId: string): Promise<void> {
    try {
      const started = await write(this.db, async (tx, businessTime) => {
        if (!(await this.active(tx))) return [];
        const scope = await this.scope(tx, user, submissionId);
        const runs = [];
        for (const item of scope.items) {
          const { context } = this.file(scope, item.id);
          const run = await this.start(
            tx,
            businessTime,
            user,
            'Evidence assistant, on submission',
            item,
            context,
          );
          if (run) runs.push(run);
        }
        return runs;
      });
      for (const run of started)
        void this.execute(run.id, run.item, run.context);
    } catch {
      this.logger.warn({
        event: 'assistant.review_submission_failed',
        submissionId,
      });
    }
  }

  private async execute(runId: string, item: Item, context: AssistantContext) {
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
      const proposal = await withinTime(
        this.provider.propose(document, context, signal),
        signal,
      );
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
    } catch (error) {
      // The error may quote the provider's reply; record only the outcome and HTTP status.
      this.logger.warn({
        event: 'assistant.provider_failed',
        runId,
        providerStatus: providerStatus(error),
      });
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

  private toMessage(row: MessageRow): AssistantChat['messages'][number] {
    return {
      id: row.id,
      role: row.role,
      text: row.text,
      by: row.by,
      at: row.at,
      provider: row.provider,
      model: row.model,
    };
  }

  async chat(
    user: User,
    submissionId: string,
    db: Db = this.db,
  ): Promise<AssistantChat> {
    const { assigned } = await this.scope(db, user, submissionId);
    const enabled = await this.active(db);
    return {
      enabled,
      canAsk: enabled && assigned,
      messages: (await this.repository.messages(submissionId, db)).map((row) =>
        this.toMessage(row),
      ),
    };
  }

  /**
   * The officer's question about the whole submission. The question is stored first; the reply
   * is worked out outside the write lock from every readable file, within the time limit, and
   * stored as the assistant's message (a plain failure message when it could not answer).
   */
  async ask(
    user: User,
    submissionId: string,
    body: unknown,
  ): Promise<AssistantChat> {
    const asked = await write(this.db, async (tx, businessTime) => {
      const scope = await this.scope(tx, user, submissionId);
      if (!scope.assigned)
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
      const parsed = assistantChatRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Write a question of up to 1,000 characters.',
          'invalid_request',
          Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join('.'),
              issue.message,
            ]),
          ),
        );
      const history = await this.repository.messages(submissionId, tx);
      await this.repository.insertMessage(
        {
          id: await nextId(tx, 'amsg'),
          submissionId,
          role: 'officer',
          text: parsed.data.question,
          by: user.displayName,
          at: businessTime,
        },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'assistant.chat',
        { type: 'submission', id: submissionId },
        `Question to the evidence assistant (${this.provider.name}, ${this.provider.model})`,
      );
      return { scope, question: parsed.data.question, history };
    });

    const begin = Date.now();
    const signal = AbortSignal.timeout(this.config.ASSISTANT_TIMEOUT_MS);
    const { scope, question } = asked;
    let reply = assistantMessages.chat_failed;
    let outcome = 'failed';
    let status: number | null = null;
    try {
      // ponytail: reads and extracts every file per question; cache by file version if slow.
      const files = await Promise.all(
        scope.items.map(async (item) => {
          const bytes = await this.files.read(item);
          const extraction = bytes
            ? await extractText(
                bytes,
                item.mimeType,
                this.config.ASSISTANT_MAX_PAGES,
              )
            : null;
          return {
            fileName: item.fileName,
            document: extraction?.ok ? extraction.document : null,
          };
        }),
      );
      const context: AssistantChatContext = {
        ...scope.context,
        citations: scope.context.citations.map(
          ({ evidenceId, ...citation }) => ({
            ...citation,
            fileName:
              scope.items.find((item) => item.id === evidenceId)?.fileName ??
              'a file not in this submission',
          }),
        ),
      };
      const answer = (
        await withinTime(
          this.provider.chat(
            files,
            context,
            asked.history.filter(
              (row) => row.text !== assistantMessages.chat_failed,
            ),
            question,
            signal,
          ),
          signal,
        )
      )
        .trim()
        .slice(0, ASSISTANT_CHAT_MAX_REPLY);
      if (answer) {
        reply = answer;
        outcome = 'answered';
      }
    } catch (error) {
      // The error may quote the provider's reply; record only the outcome and HTTP status.
      outcome = signal.aborted ? 'timed_out' : 'failed';
      status = providerStatus(error);
    }
    await write(this.db, async (tx, businessTime) => {
      // A reset may have removed the submission meanwhile.
      if (!(await this.repository.submissionInstitution(submissionId, tx)))
        return;
      await this.repository.insertMessage(
        {
          id: await nextId(tx, 'amsg'),
          submissionId,
          role: 'assistant',
          text: reply,
          by: 'Evidence assistant',
          at: businessTime,
          provider: this.provider.name,
          model: this.provider.model,
        },
        tx,
      );
    });
    this.logger.log({
      event: 'assistant.chat',
      submissionId,
      provider: this.provider.name,
      model: this.provider.model,
      outcome,
      providerStatus: status,
      files: scope.items.length,
      durationMs: Date.now() - begin,
    });
    return this.chat(user, submissionId);
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
