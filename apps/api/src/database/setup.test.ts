import { expect, it, vi } from 'vitest';
import type { Database } from './db';
import { applyMigrations, MigrationError } from './setup';

vi.mock('drizzle-orm/node-postgres/migrator', () => ({
  migrate: () =>
    Promise.reject(
      new Error('Failed query: ALTER TABLE …', {
        cause: Object.assign(
          new Error(
            'column "next_attempt_at" of relation "deliveries" already exists',
          ),
          { code: '42701', detail: 'row data stays out of the message' },
        ),
      }),
    ),
}));

it('explains a failed migration with the database error and the recovery path', async () => {
  const error = await applyMigrations({} as Database, 'drizzle').catch(
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(MigrationError);
  expect((error as Error).message).toBe(
    'Database migration failed (42701: column "next_attempt_at" of relation "deliveries" already exists). ' +
      'No migration was applied and the database is unchanged. See "If a migration fails" in README.md.',
  );
});
