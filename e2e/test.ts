import { test as base } from '@playwright/test';

export * from '@playwright/test';

/**
 * Every test starts from the seeded data, as a fresh browser does with the mock API. Against
 * the real API that data is shared, so it is reset first; without a development API the
 * request fails harmlessly.
 */
export const test = base.extend<{ seededData: void }>({
  seededData: [
    async ({ request }, use) => {
      await request.post('/api/__mock/reset').catch(() => undefined);
      await use();
    },
    { auto: true },
  ],
});
