import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config';
import { providerFrom } from './providers';

const config = (env: Record<string, string>) =>
  loadConfig({
    DATABASE_URL: 'postgres://unused/unused',
    REDIS_URL: 'redis://unused',
    ASSISTANT_PROVIDER: 'openai-compatible',
    ASSISTANT_BASE_URL: 'https://api.openai.com/v1',
    ASSISTANT_MODEL: 'gpt-4.1-mini',
    ASSISTANT_API_KEY: 'sk-test',
    ...env,
  });
const context = {
  institution: { id: 'DEMO-001', name: 'Demo Appointments Service Agency' },
  period: { label: 'Q1', startsOn: '2026-07-01', endsOn: '2026-09-30' },
  citations: [],
};

describe('OpenAI-compatible provider', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function call(env: Record<string, string>) {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'gpt-4.1-mini-2025-04-14',
          choices: [{ message: { content: '{"candidates":[]}' } }],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const proposal = await providerFrom(config(env)).propose(
      { unit: 'page', pages: ['text'] },
      context,
      AbortSignal.timeout(1000),
    );
    const [url, init] = fetch.mock.calls[0]!;
    return { url, init, body: JSON.parse(init.body), proposal };
  }

  it('calls OpenAI with the key, JSON mode and temperature 0, and reports the answering model', async () => {
    const { url, init, body, proposal } = await call({});
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(body).toMatchObject({
      model: 'gpt-4.1-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    expect(proposal.model).toBe('gpt-4.1-mini-2025-04-14');
  });

  it('omits temperature for models that accept only their default', async () => {
    const { body } = await call({ ASSISTANT_TEMPERATURE: '' });
    expect(body).not.toHaveProperty('temperature');
  });

  it('chats through any OpenAI-compatible endpoint (Anthropic here) without JSON mode', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Page 1 says "text".' } }],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const reply = await providerFrom(
      config({
        ASSISTANT_BASE_URL: 'https://api.anthropic.com/v1/',
        ASSISTANT_MODEL: 'claude-sonnet-5-5',
      }),
    ).chat(
      [{ fileName: 'a.pdf', document: { unit: 'page', pages: ['text'] } }],
      context,
      [],
      'What does it say?',
      AbortSignal.timeout(1000),
    );
    const [url, init] = fetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(url).toBe('https://api.anthropic.com/v1/chat/completions');
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body).not.toHaveProperty('response_format');
    expect(body.messages.at(-1)).toEqual({
      role: 'user',
      content: 'What does it say?',
    });
    expect(reply).toBe('Page 1 says "text".');
  });
});
