import { http, HttpResponse } from 'msw';
import {
  ASSISTANT_PROMPT_REVISION,
  assess,
  assistantCheckHints,
  assistantDecisionRequestSchema,
  assistantMessages,
  assistantSettingsRequestSchema,
  deterministicCandidates,
  hiddenKinds,
  type AssistantContext,
  type AssistantSettings,
  type AssistantView,
} from '@cpi/contracts';
import type { MockUser } from '@cpi/contracts/fixtures';
import { commit, getDb, nextId, type MockAssistantRun } from '../db';
import {
  extractText,
  MOCK_MAX_PAGES,
  MOCK_PROVIDER,
} from '../services/assistant';
import { audit } from '../services/events';
import { loadFile } from '../services/files';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { baselineOf, periodOf } from '../services/reporting';
import { assignedInstitutionIds, canReadInstitution } from '../services/scope';
import { requireRole } from '../services/session';

/** The mock twin of apps/api/src/assistant (PRD §14): same rules, deterministic provider only. */
function load(user: MockUser, submissionId: unknown, evidenceId: unknown) {
  const db = getDb();
  const submission = db.submissions.find((row) => row.id === submissionId);
  const obligation = db.obligations.find(
    (row) => row.id === submission?.obligationId,
  );
  if (
    !submission ||
    !obligation ||
    !canReadInstitution(user, obligation.institutionId)
  )
    throw notFound();
  const item = db.evidence.find((row) => row.id === evidenceId);
  if (!item || !submission.evidenceIds.includes(item.id)) throw notFound();
  const period = periodOf(obligation.periodId);
  const institution = db.institutions.find(
    (row) => row.id === obligation.institutionId,
  )!;
  const milestones =
    baselineOf(obligation.institutionId, obligation.periodId)?.milestones ?? [];
  const context: AssistantContext = {
    institution: { id: institution.id, name: institution.name },
    period: {
      label: period.label,
      startsOn: period.startsOn,
      endsOn: period.endsOn,
    },
    citations: milestones.flatMap((milestone) =>
      (submission.answers.milestones[milestone.id]?.evidence ?? [])
        .filter((reference) => reference.evidenceId === item.id)
        .map((reference) => ({
          milestoneCode: milestone.code,
          milestoneTitle: milestone.title,
          passage: reference.passage,
        })),
    ),
  };
  const versions = new Map<string, number>();
  for (
    let at: typeof item | undefined = item;
    at;
    at = db.evidence.find((row) => row.id === at!.predecessorId)
  )
    versions.set(at.id, at.version);
  const assigned =
    user.role === 'officer' &&
    assignedInstitutionIds(user.id).includes(obligation.institutionId);
  return { item, context, versions, assigned };
}

function view(user: MockUser, submissionId: unknown, evidenceId: unknown) {
  const { versions, assigned } = load(user, submissionId, evidenceId);
  const db = getDb();
  const result: AssistantView = {
    enabled: db.assistantEnabled,
    canRun: db.assistantEnabled && assigned,
    canDecide: assigned,
    runs: db.assistantRuns
      .filter((run) => versions.has(run.evidenceId))
      .reverse()
      .map((run) => ({
        ...run,
        evidenceVersion: versions.get(run.evidenceId)!,
        suggestions: db.assistantSuggestions
          .filter((suggestion) => suggestion.runId === run.id)
          .map((suggestion) => ({
            id: suggestion.id,
            kind: suggestion.kind,
            finding: suggestion.finding,
            milestoneCode: suggestion.milestoneCode,
            statement: suggestion.statement,
            quote: suggestion.quote,
            page: suggestion.page,
            decision: suggestion.decision,
          })),
      }))
      .map((run) => ({ ...run, checkHints: assistantCheckHints(run) })),
  };
  return result;
}

const forbidden = (message: string) => apiError(403, message, 'forbidden');

export const assistantHandlers = [
  http.get(
    '/api/reviews/:submissionId/evidence/:evidenceId/assistant',
    async ({ params }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      return HttpResponse.json(
        view(user, params.submissionId, params.evidenceId),
      );
    },
  ),

  http.post(
    '/api/reviews/:submissionId/evidence/:evidenceId/assistant/runs',
    async ({ params }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const { item, context, assigned } = load(
        user,
        params.submissionId,
        params.evidenceId,
      );
      if (!assigned)
        return forbidden(
          'Only the assigned officer can ask the evidence assistant.',
        );
      const db = getDb();
      if (!db.assistantEnabled)
        return apiError(
          409,
          'The evidence assistant is turned off.',
          'assistant_off',
        );
      const reusable = db.assistantRuns.some(
        (run) =>
          run.evidenceId === item.id &&
          ['completed', 'declined'].includes(run.status) &&
          run.provider === MOCK_PROVIDER.name &&
          run.promptRevision === ASSISTANT_PROMPT_REVISION,
      );
      if (!reusable) {
        const begin = Date.now();
        const base: Omit<MockAssistantRun, 'id' | 'status'> = {
          evidenceId: item.id,
          message: null,
          provider: MOCK_PROVIDER.name,
          model: MOCK_PROVIDER.model,
          promptRevision: ASSISTANT_PROMPT_REVISION,
          language: null,
          unit: null,
          unreadablePages: [],
          discarded: { untraceable: 0, instructionLike: 0 },
          hiddenKinds: [],
          requestedBy: user.displayName,
          requestedAt: db.businessTime,
          durationMs: null,
        };
        const bytes = await loadFile(item.sha256);
        const extraction = bytes
          ? await extractText(bytes, item.mimeType)
          : ({ ok: false, reason: 'no_contents' } as const);
        commit((store) => {
          const id = nextId('arun');
          if (!extraction.ok) {
            store.assistantRuns.push({
              ...base,
              id,
              status: 'declined',
              message: assistantMessages[extraction.reason],
              durationMs: Date.now() - begin,
            });
          } else {
            const { document } = extraction;
            const result = assess(
              document,
              context,
              deterministicCandidates(document, context),
            );
            const hidden = hiddenKinds(result.language, [], []);
            store.assistantRuns.push({
              ...base,
              id,
              status: 'completed',
              language: result.language,
              unit: document.unit,
              unreadablePages: result.unreadablePages,
              discarded: result.discarded,
              hiddenKinds: hidden,
              durationMs: Date.now() - begin,
            });
            for (const suggestion of result.suggestions)
              if (!hidden.includes(suggestion.kind))
                store.assistantSuggestions.push({
                  ...suggestion,
                  id: nextId('asug'),
                  runId: id,
                  decision: null,
                });
          }
          audit(
            store,
            user,
            'assistant.run',
            { type: 'evidence', id: item.id, version: item.version },
            `Evidence assistant run ${id} requested (${MOCK_PROVIDER.name}, ${MOCK_PROVIDER.model}, ${ASSISTANT_PROMPT_REVISION})`,
          );
        });
      }
      return HttpResponse.json(
        view(user, params.submissionId, params.evidenceId),
        { status: 202 },
      );
    },
  ),

  http.put(
    '/api/reviews/:submissionId/assistant/suggestions/:suggestionId',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const db = getDb();
      const suggestion = db.assistantSuggestions.find(
        (row) => row.id === params.suggestionId,
      );
      const run = db.assistantRuns.find((row) => row.id === suggestion?.runId);
      if (!suggestion || !run) return notFound();
      const { assigned } = load(user, params.submissionId, run.evidenceId);
      if (!assigned)
        return forbidden(
          'Only the assigned officer can decide on suggestions.',
        );
      const parsed = assistantDecisionRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success)
        return apiError(
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
      commit((store) => {
        store.assistantSuggestions.find(
          (row) => row.id === suggestion.id,
        )!.decision = {
          outcome: parsed.data.outcome,
          note: parsed.data.outcome === 'amended' ? parsed.data.note : '',
          by: user.displayName,
          at: store.businessTime,
        };
        audit(
          store,
          user,
          'assistant.decision',
          { type: 'assistant_suggestion', id: suggestion.id },
          `${suggestion.kind} suggestion from run ${run.id} ${parsed.data.outcome}`,
        );
      });
      return HttpResponse.json(view(user, params.submissionId, run.evidenceId));
    },
  ),

  http.get('/api/admin/assistant', async () => {
    await networkDelay();
    requireRole('administrator');
    return HttpResponse.json(settings());
  }),

  http.put('/api/admin/assistant', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const parsed = assistantSettingsRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Say whether the evidence assistant is on.',
        'invalid_request',
      );
    commit((store) => {
      store.assistantEnabled = parsed.data.enabled;
      audit(
        store,
        user,
        'assistant.settings',
        { type: 'assistant', id: 'deployment' },
        `Evidence assistant turned ${parsed.data.enabled ? 'on' : 'off'} (${MOCK_PROVIDER.name}, ${MOCK_PROVIDER.model})`,
      );
    });
    return HttpResponse.json(settings());
  }),
];

function settings(): AssistantSettings {
  const db = getDb();
  const runs = db.assistantRuns;
  const decided = (outcome: string) =>
    db.assistantSuggestions.filter((row) => row.decision?.outcome === outcome)
      .length;
  return {
    enabled: db.assistantEnabled,
    available: true,
    unavailableReason: null,
    provider: MOCK_PROVIDER.name,
    model: MOCK_PROVIDER.model,
    endpoint: 'in-process',
    promptRevision: ASSISTANT_PROMPT_REVISION,
    termsRef: null,
    hiddenKinds: [],
    otherLanguageKinds: [],
    maxPages: MOCK_MAX_PAGES,
    timeoutMs: 90_000,
    usage: {
      runs: runs.length,
      completed: runs.filter((run) => run.status === 'completed').length,
      failed: runs.filter((run) => run.status === 'failed').length,
      declined: runs.filter((run) => run.status === 'declined').length,
      suggestions: db.assistantSuggestions.length,
      accepted: decided('accepted'),
      amended: decided('amended'),
      dismissed: decided('dismissed'),
      discarded: runs.reduce((sum, run) => sum + run.discarded.untraceable, 0),
    },
  };
}
