import {
  assistantPrompt,
  deterministicCandidates,
  parseCandidates,
  type AssistantCandidate,
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
}

/**
 * The configured provider. Changing provider or model is configuration only: the deterministic
 * mode (tests, CI, offline demo) or any OpenAI-compatible chat endpoint, which covers locally
 * hosted models through Ollama (`http://127.0.0.1:11434/v1`) and hosted APIs.
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
    };
  const base = config.ASSISTANT_BASE_URL.replace(/\/+$/, '');
  return {
    name: 'openai-compatible',
    model: config.ASSISTANT_MODEL,
    endpoint: new URL(base).host,
    async propose(document, context, signal) {
      const { system, user } = assistantPrompt(document, context);
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
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      // The body may echo the prompt: report the status only.
      if (!response.ok)
        throw new Error(`The provider answered ${response.status}.`);
      const body = (await response.json()) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
      };
      const reply = body.choices?.[0]?.message?.content ?? '';
      return {
        ...parseCandidates(reply),
        model: body.model || config.ASSISTANT_MODEL,
      };
    },
  };
}
