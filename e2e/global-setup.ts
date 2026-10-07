import { request, type APIResponse, type FullConfig } from '@playwright/test';
import { ensureOk } from './support';

const why =
  'The e2e suite needs the development stack in demo mode on a disposable demo database (see docs/platform-contracts.md).';

async function check(step: string, response: APIResponse) {
  try {
    ensureOk(step, response.status(), await response.json().catch(() => null));
  } catch (error) {
    throw new Error(`${(error as Error).message}\n${why}`, { cause: error });
  }
}

/**
 * Checks once, before any test, that the stack lets the suite reset the demo data and run the
 * scripted year, so a refusing environment fails with one explanation instead of in every test.
 */
export default async function globalSetup(config: FullConfig) {
  if (process.env.CPI_PRODUCTION === 'true') return;
  const context = await request.newContext({
    baseURL: config.projects[0]!.use.baseURL,
  });
  try {
    await check(
      'Resetting the demo data (POST /api/__mock/reset)',
      await context.post('/api/__mock/reset'),
    );
    await check(
      'Signing in as the administrator',
      await context.post('/api/session', {
        data: { accountId: 'administrator' },
      }),
    );
    const state = await context.get('/api/simulation');
    await check('Reading the simulation state', state);
    if (!((await state.json()) as { controls: boolean }).controls)
      throw new Error(
        `Simulation controls are off, so the scripted year cannot run. ${why}`,
      );
  } finally {
    await context.dispose();
  }
}
