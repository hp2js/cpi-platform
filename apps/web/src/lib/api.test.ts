import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from './api';
import { parseSearch } from './search';
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
    await expect(request('/api/example')).rejects.toMatchObject({
      status: 422,
      fieldErrors: { name: 'Already exists' },
    });
  });
  it('handles non-JSON gateway failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })),
    );
    await expect(request('/api/example')).rejects.toMatchObject({
      status: 502,
      message: 'The service is unavailable. Please try again.',
    });
  });
});
it('normalizes invalid URL state', () => {
  expect(parseSearch({ q: 10, sort: 'arbitrary', desc: 'false' })).toEqual({
    q: '',
    sort: 'name',
    desc: false,
  });
});
