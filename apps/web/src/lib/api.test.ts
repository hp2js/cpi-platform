import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from './api';
import { z } from 'zod';
afterEach(() => vi.unstubAllGlobals());
describe('API errors', () => {
  it('preserves field validation errors for the form layer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Check your entry',
            fieldErrors: { name: 'Already exists' },
          }),
          { status: 422 },
        ),
      ),
    );
    await expect(request('/api/example', z.unknown())).rejects.toMatchObject({
      status: 422,
      fieldErrors: { name: 'Already exists' },
    });
  });
  it('handles non-JSON gateway failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })),
    );
    await expect(request('/api/example', z.unknown())).rejects.toMatchObject({
      status: 502,
      message: 'The service is unavailable. Please try again.',
    });
  });
});
it('rejects malformed successful responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{"status":42}')),
  );
  await expect(
    request('/api/example', z.object({ status: z.string() })),
  ).rejects.toMatchObject({
    message: 'The server returned an invalid response.',
  });
});
it('supports explicit no-content responses and JSON requests with Headers', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    request('/api/example', z.undefined(), {
      method: 'POST',
      json: { name: 'Example' },
      headers: new Headers({ 'X-Test': 'kept' }),
    }),
  ).resolves.toBeUndefined();
  const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
  expect(new Headers(options.headers).get('X-Test')).toBe('kept');
  expect(new Headers(options.headers).get('Content-Type')).toBe(
    'application/json',
  );
  expect(options.body).toBe('{"name":"Example"}');
});
it('treats null and malformed error bodies as gateway failures', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('null', { status: 500 })),
  );
  await expect(request('/api/example', z.unknown())).rejects.toMatchObject({
    status: 500,
    fieldErrors: {},
  });
});
