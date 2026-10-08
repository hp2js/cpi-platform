import { test as base } from '@playwright/test';
import { ensureOk } from './support';

export * from '@playwright/test';

/**
 * Every test starts from the seeded data, as a fresh browser does with the mock API. Against
 * the real API that data is shared, so it is reset first. The production stack has no reset by
 * design, and its specs do not depend on it.
 */
export const test = base.extend<{ seededData: void }>({
  seededData: [
    async ({ request }, use) => {
      if (process.env.CPI_PRODUCTION !== 'true') {
        const response = await request.post('/api/__mock/reset');
        ensureOk(
          'Resetting the demo data (POST /api/__mock/reset)',
          response.status(),
          await response.json().catch(() => null),
        );
      }
      await use();
    },
    { auto: true },
  ],
});
