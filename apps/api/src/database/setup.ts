import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { count } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './db';
import { loadFixtures } from './fixtures';
import { systemState } from './schema';

/**
 * Brings the database up to date when the API starts: applies checked-in migrations, and seeds
 * only an empty database (demo fixtures or a clean cycle), so a restart never wipes data.
 * ponytail: run by every API instance; with several replicas, migrate once in a release step.
 */
export async function prepareDatabase(
  db: Database,
  seed: Parameters<typeof loadFixtures>[1],
) {
  const logger = new Logger('Database');
  // dist/database/setup.js → apps/api/drizzle (also /app/drizzle in the production image).
  await migrate(db, {
    migrationsFolder: join(__dirname, '..', '..', 'drizzle'),
  });
  const [state] = await db.select({ n: count() }).from(systemState);
  if (!state?.n) {
    await loadFixtures(db, seed);
    logger.log({ event: 'database.seeded', demo: seed?.demo ?? true });
  }
}
