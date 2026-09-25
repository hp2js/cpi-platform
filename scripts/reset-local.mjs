import { spawnSync } from 'node:child_process';
if (!process.argv.includes('--confirm-local-data-loss')) {
  console.error(
    'This deletes this project’s local PostgreSQL and Redis volumes. Run pnpm db:reset --confirm-local-data-loss to confirm.',
  );
  process.exit(1);
}
const result = spawnSync(
  'docker',
  ['compose', '-p', 'hp2js-cpi', 'down', '--volumes'],
  { stdio: 'inherit', cwd: new URL('..', import.meta.url) },
);
process.exit(result.status ?? 1);
