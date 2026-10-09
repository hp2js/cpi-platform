import {
  ASSISTANT_CHARS_PER_PAGE,
  assistantChatPrompt,
  assistantPrompt,
  deterministicCandidates,
  deterministicChatReply,
  parseCandidates,
  type AssistantCandidate,
  type AssistantChatContext,
  type AssistantChatFile,
  type AssistantContext,
  type AssistantDocument,
} from '@cpi/contracts';
import type { AppConfig } from '../config';

export interface Proposal {
  candidates: AssistantCandidate[];
  /** Items the provider returned that were not valid candidates; counted as untraceable. */
  malformed: number;
  /** The model and version that actually answered, as the provider reports it. */
  model: string;
}

export interface Provider {
  name: string;
  model: string;
  /** Host only, never the key: shown to administrators. */
  endpoint: string;
  propose(
    document: AssistantDocument,
    context: AssistantContext,
    signal: AbortSignal,
  ): Promise<Proposal>;
  /** A reply to the officer's question about a whole submission, from its files only. */
  chat(
    files: AssistantChatFile[],
    context: AssistantChatContext,
    history: { role: 'officer' | 'assistant'; text: string }[],
    question: string,
    signal: AbortSignal,
  ): Promise<string>;
}

/**
 * The configured provider. Changing provider or model is configuration only: the deterministic
 * mode (tests, CI, offline demo) or any OpenAI-compatible chat endpoint: Ollama
 * (`http://127.0.0.1:11434/v1`), OpenAI, and the compatible endpoints of Anthropic, Gemini,
 * Mistral and others (docs/assistant.md lists their base URLs).
 */
export function providerFrom(config: AppConfig): Provider {
  if (config.ASSISTANT_PROVIDER === 'deterministic')
    return {
      name: 'deterministic',
      model: 'rules',
      endpoint: 'in-process',
      propose: async (document, context) => ({
        candidates: deterministicCandidates(document, context),
        malformed: 0,
        model: 'rules',
      }),
      chat: async (files, _context, _history, question) =>
        deterministicChatReply(files, question),
    };
  const base = config.ASSISTANT_BASE_URL.replace(/\/+$/, '');
  const complete = async (
    messages: { role: string; content: string }[],
    json: boolean,
    signal: AbortSignal,
  ) => {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      // Never follow a redirect to somewhere the configuration did not name.
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        ...(config.ASSISTANT_API_KEY
          ? { Authorization: `Bearer ${config.ASSISTANT_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model: config.ASSISTANT_MODEL,
        ...(config.ASSISTANT_TEMPERATURE === null
          ? {}
          : { temperature: config.ASSISTANT_TEMPERATURE }),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        messages,
      }),
    });
    // The body may echo the prompt: report the status only.
    if (!response.ok)
      throw Object.assign(
        new Error(`The provider answered ${response.status}.`),
        { status: response.status },
      );
    const body = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };
    return {
      reply: body.choices?.[0]?.message?.content ?? '',
      model: body.model || config.ASSISTANT_MODEL,
    };
  };
  return {
    name: 'openai-compatible',
    model: config.ASSISTANT_MODEL,
    endpoint: new URL(base).host,
    async propose(document, context, signal) {
      const { system, user } = assistantPrompt(document, context);
      const { reply, model } = await complete(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        true,
        signal,
      );
      return { ...parseCandidates(reply), model };
    },
    async chat(files, context, history, question, signal) {
      const { reply } = await complete(
        assistantChatPrompt(
          files,
          context,
          history,
          question,
          config.ASSISTANT_MAX_PAGES * ASSISTANT_CHARS_PER_PAGE,
        ),
        false,
        signal,
      );
      return reply;
    },
  };
}
