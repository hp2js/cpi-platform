import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetDb } from './mocks/db';
import { server } from './mocks/node';

// jsdom does not implement scrolling; the router's scroll restoration calls it.
window.scrollTo = () => undefined;

// The mock API runs in tests too, so components are exercised against the same contract.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetDb();
  localStorage.clear();
});
afterAll(() => server.close());
