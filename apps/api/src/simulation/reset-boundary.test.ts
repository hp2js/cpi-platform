import 'reflect-metadata';
import { expect, it } from 'vitest';
import type { User } from '../auth/sessions';
import { disposableDatabase, loadConfig } from '../config';
import { SimulationController } from './simulation.controller';

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

it('refuses to reset or script the year outside the demo database', async () => {
  const controller = (database: string, demo?: string) =>
    new SimulationController(
      {} as never,
      {} as never,
      {} as never,
      config(database, demo),
    );
  const admin = {} as User;
  await expect(controller('cpi_local').reset(admin, {})).rejects.toMatchObject({
    status: 409,
    response: { code: 'not_demo_database' },
  });
  await expect(controller('cpi_local').scenario()).rejects.toMatchObject({
    response: { code: 'not_demo_database' },
  });
  await expect(
    controller('cpi_demo', 'false').reset(admin, {}),
  ).rejects.toMatchObject({ response: { code: 'demo_only' } });
});
