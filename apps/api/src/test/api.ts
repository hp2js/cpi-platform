import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadFixtures } from '../database/fixtures';
import * as schema from '../database/schema';

/**
 * Integration tests run the compiled server (`node dist/main.js`, so Nest's decorator metadata
 * is present) against `<database>_test` and Redis database 15 of the local Docker services.
 * They are opt-in: `pnpm test:integration` builds the API and sets INTEGRATION=1.
 */
export const integration = process.env.INTEGRATION === '1';

config({ path: '../../.env', quiet: true });

function testUrls() {
  const database = new URL(process.env.DATABASE_URL ?? '');
  const name = `${database.pathname.slice(1)}_test`;
  const test = new URL(database);
  test.pathname = `/${name}`;
  const redis = new URL(process.env.REDIS_URL ?? '');
  redis.pathname = '/15';
  return { admin: database.href, name, database: test.href, redis: redis.href };
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('No port')),
      );
    });
  });
}

export async function startApi() {
  const urls = testUrls();
  const admin = new Pool({ connectionString: urls.admin });
  try {
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [urls.name],
    );
    if (!exists.rowCount) await admin.query(`CREATE DATABASE "${urls.name}"`);
  } finally {
    await admin.end();
  }
  const pool = new Pool({ connectionString: urls.database });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: 'drizzle' });
  await loadFixtures(db);

  const port = await freePort();
  const server: ChildProcess = spawn(process.execPath, ['dist/main.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      API_PORT: String(port),
      DATABASE_URL: urls.database,
      REDIS_URL: urls.redis,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; ; attempt += 1) {
    const ready = await fetch(`${url}/api/health/ready`).catch(() => undefined);
    if (ready?.ok) break;
    if (attempt > 100 || server.exitCode !== null)
      throw new Error('The API did not become ready.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    db,
    /** Restore the fixture state between tests. */
    reset: () => loadFixtures(db),
    client: () => new Client(url),
    async stop() {
      server.kill();
      await pool.end();
    },
  };
}

/** A browser-like caller that keeps its session cookie. */
export class Client {
  private cookie = '';
  constructor(private readonly url: string) {}

  async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.url}/api${path}`, {
      ...init,
      headers: {
        ...(typeof init.body === 'string'
          ? { 'content-type': 'application/json' }
          : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...init.headers,
      },
    });
    for (const header of response.headers.getSetCookie())
      this.cookie = header.split(';')[0]!;
    const text = await response.text();
    const json = response.headers.get('content-type')?.includes('json');
    return {
      status: response.status,
      body: json && text ? (JSON.parse(text) as unknown) : (text as unknown),
      headers: response.headers,
    };
  }

  async json<T = unknown>(path: string, init?: RequestInit) {
    const result = await this.request(path, init);
    if (result.status >= 400)
      throw new Error(
        `${path}: ${result.status} ${JSON.stringify(result.body)}`,
      );
    return result.body as T;
  }

  post(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
    });
  }

  /** A multipart evidence upload, as the browser sends it. */
  upload(
    path: string,
    file: { name: string; bytes: Uint8Array },
    fields: Record<string, string>,
  ) {
    const form = new FormData();
    form.set('file', new Blob([Buffer.from(file.bytes)]), file.name);
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    return this.request(path, { method: 'POST', body: form });
  }

  put(path: string, body: unknown) {
    return this.request(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  async signIn(accountId: string) {
    const result = await this.post('/session', { accountId });
    if (result.status !== 200)
      throw new Error(`Sign-in failed: ${result.status}`);
    return this;
  }

  /** Simulate a server-side expiry (the mock's "expire session" control). */
  forgetCookieValue(value = 'expired-session-id') {
    this.cookie = `cpi_session=${value}`;
  }
}
