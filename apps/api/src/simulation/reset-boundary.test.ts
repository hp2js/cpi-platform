import 'reflect-metadata';
import { expect, it } from 'vitest';
import { disposableDatabase, loadConfig } from '../config';
import { DemoEnvironmentGuard } from './demo-environment.guard';

const config = (database: string, demo = 'true') =>
  loadConfig({
    DATABASE_URL: `postgresql://user:secret@127.0.0.1:15432/${database}`,
    REDIS_URL: 'redis://127.0.0.1:16379',
    DEMO_MODE: demo,
    ADMIN_EMAIL: 'operator@example.invalid',
  });

it('treats only databases named …_demo or …_test as disposable (HP2-42)', () => {
  expect(disposableDatabase(config('cpi_demo'))).toBe(true);
  expect(disposableDatabase(config('cpi_demo_test'))).toBe(true);
  expect(disposableDatabase(config('cpi_local'))).toBe(false);
  expect(disposableDatabase(config('cpi_demo_backup'))).toBe(false);
});

it('refuses to reset or script the year outside the demo database', () => {
  const guard = (database: string, demo?: string) =>
    new DemoEnvironmentGuard(config(database, demo));
  expect(() => guard('cpi_local').canActivate()).toThrow(
    expect.objectContaining({
      status: 409,
      response: expect.objectContaining({ code: 'not_demo_database' }),
    }),
  );
  expect(() => guard('cpi_demo', 'false').canActivate()).toThrow(
    expect.objectContaining({
      response: expect.objectContaining({ code: 'demo_only' }),
    }),
  );
  expect(guard('cpi_demo').canActivate()).toBe(true);
});
