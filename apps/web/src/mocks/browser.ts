import { setupWorker } from 'msw/browser';
import { setBeforeRequest } from '@/lib/api';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

// The browser stops an idle service worker (quickly, for a background tab) and the restarted
// worker has forgotten which pages it mocks, so requests would silently reach the real API.
// Re-register this page before a request once the worker may have been idle. It cannot be
// stopped within 30 seconds of handling an event, so a 10-second window is safe.
const ACTIVATION_WINDOW_MS = 10_000;
let activatedAt = 0;

function reactivate(): Promise<void> {
  const controller = navigator.serviceWorker.controller;
  if (!controller || Date.now() - activatedAt < ACTIVATION_WINDOW_MS)
    return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      clearTimeout(timer);
      activatedAt = Date.now();
      resolve();
    };
    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'MOCKING_ENABLED') done();
    };
    const timer = setTimeout(done, 1000);
    navigator.serviceWorker.addEventListener('message', onMessage);
    controller.postMessage('MOCK_ACTIVATE');
  });
}

export async function startMockApi() {
  await worker.start({
    // Requests the mock does not define (e.g. /api/health) go to the real API.
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: '/mockServiceWorker.js' },
  });
  activatedAt = Date.now();
  setBeforeRequest(reactivate);
}
