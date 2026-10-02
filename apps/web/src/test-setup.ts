import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { resetDb } from './mocks/db';
import { server } from './mocks/node';

// Mock-API tests run in the Node environment (native fetch/FormData); UI tests use jsdom.
const browserLike = typeof window !== 'undefined';

// jsdom does not implement scrolling; the router's scroll restoration calls it.
if (browserLike) window.scrollTo = () => undefined;
// Without a page, MSW has no origin to resolve relative handler paths such as /api/session.
else
  Object.defineProperty(globalThis, 'location', {
    value: new URL('http://localhost/'),
    configurable: true,
  });

// Under pnpm check's parallel load the first render can take longer than the default 1 s.
configure({ asyncUtilTimeout: 10_000 });

// The mock API runs in tests too, so components are exercised against the same contract.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  if (browserLike) {
    cleanup();
    localStorage.clear();
  }
  server.resetHandlers();
  resetDb();
});
afterAll(() => server.close());
