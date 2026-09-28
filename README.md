# CPI Platform

HP2JS's Adili V3 Track 2 workspace for corruption prevention reporting and review.

The [PRD](https://docs.google.com/document/d/1E7HgjDUJtKJyFHGqm59FJC_4-tzCgfieI-Ex97EYWlI/edit) defines the product and Linear tracks delivery. This README covers setup and day-to-day commands; [the frontend guide](docs/frontend.md) covers implementation patterns.

## Start with Docker

Install Docker with Compose **2.24.4 or newer**, then:

```sh
cp .env.example .env
docker compose up -d --build --wait
```

Open **http://localhost:5180**. Source changes in `apps/*/src` and `packages/contracts/src` reload automatically. Dependency, lockfile, tsconfig or Dockerfile changes need a rebuild: rerun `pnpm docker:up`, or develop with `pnpm docker:dev`, which rebuilds on those changes (Compose Watch).

| Service       | Local address                          |
| ------------- | -------------------------------------- |
| Web           | http://localhost:5180                  |
| API liveness  | http://localhost:3001/api/health/live  |
| API readiness | http://localhost:3001/api/health/ready |
| PostgreSQL    | localhost:15432                        |
| Redis         | localhost:16379                        |

Ports bind to loopback, and the `hp2js-cpi` Compose project has its own network and volumes. `.env.example` credentials are for local development only. **Never use real institution records or personal data locally; use synthetic data.**

## Run applications on your machine

Use the Node version in `.nvmrc`; Corepack provides the pnpm version pinned in `package.json`.

```sh
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env  # first setup only; preserve existing configuration
pnpm services:up      # PostgreSQL and Redis in Docker
pnpm dev              # contracts, API and web in watch mode
```

If the Docker applications are running, first run `docker compose stop api web` to free their ports. The Vite dev server proxies `/api` to the API, so no CORS configuration is needed.

## Daily commands

```sh
pnpm check            # lint, typecheck, tests, production builds
pnpm format           # format source and docs
pnpm format:check     # CI formatting check
pnpm test:smoke       # running Docker stack: outages, recovery, DB persistence
pnpm test:integration # running Docker services: API tests against a `_test` database
pnpm test:e2e         # running dev stack: browser tests (Playwright)
pnpm test:e2e:prod    # running `docker:prod` stack: adds web-server checks
pnpm docker:up        # rebuild and start the development stack
pnpm docker:dev       # development stack with automatic rebuilds
pnpm docker:logs      # follow application and service logs
pnpm docker:down      # stop/remove containers; keep data
```

Run a script in one workspace with `pnpm --filter <package> <script>`, for example `pnpm --filter @cpi/api test`.

## Database workflow

```sh
pnpm db:generate     # generate SQL from Drizzle schema changes
pnpm db:migrate      # apply checked-in migrations to DATABASE_URL
pnpm db:seed         # load synthetic fixtures
```

- Generate migrations on the host so the files land in the checkout. Commit the generated SQL and Drizzle metadata together, and review migrations before applying them.
- Do not use schema push against shared environments.
- To run a database command inside the development API container: `docker compose exec api pnpm --filter @cpi/api db:migrate`.

**Destructive local reset.** This deletes this project's PostgreSQL and Redis volumes:

```sh
pnpm db:reset --confirm-local-data-loss
pnpm docker:up
```

Ordinary shutdown and rebuild keep data. Changing database credentials in `.env` does not change an existing database's users: alter them deliberately, or reset disposable local data.

## Production image verification

```sh
pnpm docker:prod
curl --fail http://localhost:5180/api/health/ready
```

This builds the production images and runs them hardened, on the same local ports as development: non-root, read-only filesystem, no Linux capabilities. Caddy serves the built frontend and proxies `/api` to the API, so no API URL or secret is bundled into browser assets. Return to development with `pnpm docker:up`.

This is a **local check of the production images**, not a deployment configuration. Secrets management, TLS, access control and backups belong to deployment.

## Structure

```text
apps/api                 NestJS API
apps/web                 Vite/React frontend
packages/contracts       Schemas and types shared by API and web
packages/tsconfig        Shared strict TypeScript configuration
scripts                  Local maintenance and verification scripts
e2e                      Playwright browser tests
docker                   Development and production images; Caddy config
docs                     Contributor guides
```

## Conventions

- **Versions are pinned.** Packages are exact, and container images and GitHub Actions are pinned by digest or commit SHA. Dependabot proposes updates; after taking one, run `pnpm check` and the Docker checks above. Keep `.nvmrc` in step with the Node base image.
- **Each workspace declares the tools its scripts call.** Docker images install only their own app's dependency graph, so an undeclared tool can work on the host and still fail in a container.
- **Keep Dockerfiles cache-friendly.** Copy manifests and the lockfile before installing, and copy source afterwards.
- **Native dependency builds are allowlisted** in `pnpm-workspace.yaml`.
- **CI mirrors local checks.** On failure, Compose logs and Playwright traces are uploaded as the `failure-diagnostics` artifact.

## Troubleshooting

- **Engine mismatch:** run `nvm use`.
- **Browsers missing for e2e:** run `pnpm exec playwright install chromium`.
- **Port occupied:** check `docker compose ps` and other local processes, and stop only the conflicting service you own. Ports are fixed in the Compose and Vite configuration.
- **Readiness fails (503):** readiness requires both PostgreSQL and Redis; liveness only checks that the API process responds. Inspect `docker compose logs api postgres redis`. The API logs `dependency.failure` events with a sanitized error code. Every API response carries an `X-Request-ID` that matches its log entry.
- **Changes not reflected in Docker:** rerun `pnpm docker:up`.
- **Local app cannot connect:** compare the `.env` URLs with the host ports above. Inside Docker, services use container names and internal ports instead.
