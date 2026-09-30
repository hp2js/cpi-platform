import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const compose = (...args) =>
  execFileSync('docker', ['compose', ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
const probe = async (path) =>
  fetch(`http://127.0.0.1:5180/api/health/${path}`, {
    signal: AbortSignal.timeout(5000),
  });
async function waitReady() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await probe('ready')).ok) return;
    } catch {
      /* wait for startup */
    }
    await setTimeout(1000);
  }
  throw new Error('API failed to become ready');
}
await waitReady();
for (const dependency of ['redis', 'postgres', 'minio']) {
  try {
    compose('stop', dependency);
    assert.equal((await probe('live')).status, 200);
    const response = await probe('ready');
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(
      body.services[
        dependency === 'postgres'
          ? 'database'
          : dependency === 'minio'
            ? 'storage'
            : 'redis'
      ],
      'down',
    );
  } finally {
    compose('start', dependency);
    await waitReady();
  }
  console.log(`${dependency}: outage detection and recovery passed`);
}
const sql = (statement) =>
  compose(
    'exec',
    '-T',
    'postgres',
    'sh',
    '-c',
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"',
    '--',
    statement,
  ).trim();
const table = `setup_probe_${Date.now()}`;
try {
  sql(
    `CREATE TABLE ${table} (value text); INSERT INTO ${table} VALUES ('persisted');`,
  );
  compose('restart', 'postgres');
  await waitReady();
  assert.equal(sql(`SELECT value FROM ${table}`), 'persisted');
  console.log('PostgreSQL persistence across restart passed');
} finally {
  sql(`DROP TABLE IF EXISTS ${table}`);
}
console.log('Smoke checks passed');
