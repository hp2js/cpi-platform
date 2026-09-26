import { http, HttpResponse, type HttpHandler } from 'msw';
import { apiError } from '../services/http';

/**
 * Development-only fault injection for rehearsing recovery paths (HP2-35). The next matching
 * API request fails as configured, then behaviour returns to normal.
 */
export type FaultKind = 'network' | 'server' | 'drop-response';
let pending: { kind: FaultKind; path: string | null } | null = null;

export const faultHandlers: HttpHandler[] = [
  http.post('/api/__mock/fault', async ({ request }) => {
    const body = (await request.json()) as {
      kind: FaultKind | null;
      path?: string;
    };
    pending = body.kind ? { kind: body.kind, path: body.path ?? null } : null;
    return HttpResponse.json({ pending });
  }),
  http.all('/api/*', async ({ request }) => {
    const url = new URL(request.url);
    if (
      !pending ||
      url.pathname.startsWith('/api/__mock') ||
      (pending.path && !url.pathname.includes(pending.path))
    )
      return undefined;
    const fault = pending;
    pending = null;
    if (fault.kind === 'network') return HttpResponse.error();
    if (fault.kind === 'server')
      return apiError(
        503,
        'The service is temporarily unavailable. Please try again.',
        'unavailable',
      );
    // The server completes the work, but the response never arrives (a timeout after commit).
    await fetch(request.clone());
    return HttpResponse.error();
  }),
];
