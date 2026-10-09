import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';
if (existsSync('../../.env')) process.loadEnvFile('../../.env');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
});
