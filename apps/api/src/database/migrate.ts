import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadConfig } from '../config';

async function main() {
  const config = loadConfig(process.env);
  if (!existsSync('drizzle/meta/_journal.json')) {
    console.log(
      'No migrations yet. Add the domain schema, then run pnpm db:generate.',
    );
    return;
  }
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
  } finally {
    await pool.end();
  }
}
void main();
