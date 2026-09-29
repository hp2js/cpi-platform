import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadConfig } from '../config';
import { loadFixtures } from './fixtures';
import * as schema from './schema';

/** Replace all data with the fictional PRD §17.1 fixtures. Local and test databases only. */
async function main() {
  const config = loadConfig(process.env);
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  try {
    await loadFixtures(drizzle(pool, { schema, casing: 'snake_case' }));
    console.log('Loaded the fictional FY2026/27 fixtures.');
  } finally {
    await pool.end();
  }
}
void main();
