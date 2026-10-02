import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadConfig } from '../config';
import { errorCode } from '../http/diagnostics';
import * as schema from './schema';
import { applyMigrations, MigrationError } from './setup';

async function main() {
  const config = loadConfig(process.env);
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  try {
    await applyMigrations(
      drizzle(pool, { schema, casing: 'snake_case' }),
      'drizzle',
    );
    console.log('Migrations are up to date.');
  } finally {
    await pool.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof MigrationError
      ? error.message
      : `Could not run migrations (${errorCode(error)}).`,
  );
  process.exitCode = 1;
});
