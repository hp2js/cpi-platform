import { loadConfig } from '../config';
import { Mailer } from '../email/mailer';
import { Infrastructure } from '../infrastructure';
import { Objects } from '../storage/objects';
import { loadFixtures, seedOptions } from './fixtures';

/**
 * Replace all data with the starting state: the fictional PRD §17.1 fixtures in demo mode,
 * otherwise a clean cycle with only the configured administrator. Local and test databases only.
 */
async function main() {
  const config = loadConfig(process.env);
  const objects = new Objects(config);
  const infrastructure = new Infrastructure(config, objects);
  try {
    await loadFixtures(
      infrastructure.database,
      seedOptions(config, new Mailer(infrastructure, config)),
    );
    console.log(
      config.DEMO_MODE
        ? 'Loaded the fictional FY2026/27 fixtures.'
        : 'Loaded a clean FY2026/27 cycle with no institutions or demo accounts.',
    );
  } finally {
    await infrastructure.onApplicationShutdown();
    objects.onApplicationShutdown();
  }
}
void main();
