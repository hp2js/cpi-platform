# CPI Platform

HP2JS's Adili V3 Track 2 workspace for corruption prevention reporting and review.
This repository currently provides the development foundation, not the business workflows.

The [PRD](https://docs.google.com/document/d/1E7HgjDUJtKJyFHGqm59FJC_4-tzCgfieI-Ex97EYWlI/edit) defines the product. Linear tracks delivery. This README is the source for setup commands; [the frontend guide](docs/frontend.md) covers implementation patterns.

## Start with Docker

Install Docker with Compose **2.24.4 or newer**, then:

```sh
cp .env.example .env
docker compose up -d --build --wait
```

Open **http://localhost:5180**. The foundation screen includes real API readiness checks and explicitly fictional table/form examples. Source changes in `apps/api/src` and `apps/web/src` reload automatically. Rebuild after changing dependencies, configuration or shared packages.

| Service       | Local address                          |
| ------------- | -------------------------------------- |
| Web           | http://localhost:5180                  |
| API liveness  | http://localhost:3001/api/health/live  |
| API readiness | http://localhost:3001/api/health/ready |
| PostgreSQL    | localhost:15432                        |
| Redis         | localhost:16379                        |

Ports bind to loopback. Project `hp2js-cpi` has its own network and persistent volumes. `.env.example` credentials are for local development only. Never use real institution records or personal data in the foundation.

## Run applications on your machine

Use the Node version in `.nvmrc` and the pnpm version in `package.json`.

```sh
nvm install
nvm use
corepack enable
corepack prepare pnpm@10.32.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env  # first setup only; preserve existing configuration
pnpm services:up
pnpm dev
```

If Docker applications are already running, first run `docker compose stop api web` to release their ports. `pnpm dev` runs API and web together. PostgreSQL and Redis remain in Docker. The Vite proxy routes `/api` to NestJS without browser CORS configuration.

## Daily commands

```sh
pnpm check            # lint, typecheck, tests, production builds
pnpm format           # format source and docs
pnpm format:check     # CI formatting check
pnpm test:smoke       # running Docker stack: outages, recovery, DB persistence
pnpm docker:logs      # follow application and service logs
pnpm docker:down      # stop/remove containers; keep data
pnpm docker:up        # rebuild and start the development stack
```

Individual workspaces: `pnpm --filter @cpi/api test`, `pnpm --filter @cpi/web dev`.

## Database workflow

```sh
pnpm db:generate     # generate SQL after adding/changing Drizzle schema
pnpm db:migrate      # apply checked-in migrations to DATABASE_URL
pnpm db:seed         # fixture entry point
```

The schema is intentionally empty until HP2-12 introduces domain tables. Migration and seed commands currently explain this and perform no writes. Never treat an empty seed command as a populated demo database. Synthetic fixtures belong to HP2-28. Commit generated SQL and Drizzle metadata together; review migrations before applying them. Do not use schema push for shared environments.

To run these inside the development API container, use `docker compose exec api pnpm --filter @cpi/api db:migrate` (or `db:seed`). Generate migrations on the host so their files remain in the checkout.

**Destructive local reset** — deletes this project's PostgreSQL and Redis volumes:

```sh
pnpm db:reset --confirm-local-data-loss
pnpm docker:up
```

Ordinary shutdown and rebuild preserve data. Changing database credentials after initialization does not change the existing database users; either alter them deliberately or reset disposable local data.

## Production image verification

```sh
pnpm docker:prod
curl --fail http://localhost:5180/api/health/ready
```

This builds a non-root Node API and a non-root Caddy static frontend. Caddy proxies `/api` to the API; no API URL or secret is bundled in browser assets. The Compose override replaces the development services on the same local ports. Return to development with `pnpm docker:up`. Caddy serves SPA deep links, compresses responses, caches fingerprinted assets and exposes `/healthz` on container port 8080. The local configuration uses HTTP; domain/TLS configuration belongs to deployment. See `docker/Caddyfile` and the [Caddy SPA/proxy patterns](https://caddyserver.com/docs/caddyfile/patterns).

This is a **local production-image check**, not a public deployment specification. Deployment needs environment-managed secrets, TLS, access control, backups and the product's authentication/authorization work. No cloud providers have been selected here.

## Structure

```text
apps/api                 NestJS, Drizzle and Redis wiring; health endpoints
apps/web                 Vite/React; TanStack Query, Router, Table, Form; shadcn/ui
packages/contracts       API transport types shared by both applications
packages/tsconfig        Shared strict TypeScript configuration
scripts                  Local maintenance commands
docker                   Development and production images; Caddy config
docs                     Contributor guides
```

Health liveness only reports that the API process responds. Readiness checks both PostgreSQL and Redis and returns **503** if either fails. Connection failures do not reveal credentials. Health endpoints are scaffolding, not authorization boundaries.

## CI and reproducibility

CI performs a frozen install, formatting, lint, type checking, tests, builds, then starts and probes both Docker variants. Package versions and container digests are pinned. Update them deliberately with a refreshed lockfile and image digests, then run the same checks. Native dependency builds are allowlisted in `pnpm-workspace.yaml`.

## Troubleshooting

- **Engine mismatch:** run `nvm use`; Node 20/22 is not the configured runtime.
- **Port occupied:** inspect `docker compose ps` and other local processes; stop only the conflicting service you own. Ports are fixed in Compose and Vite configuration.
- **Readiness fails:** inspect `docker compose logs api postgres redis`. Both dependencies must be healthy. Database/cache failures do not make liveness fail.
- **Changed package/config not reflected in Docker:** rerun `pnpm docker:up`.
- **Local app cannot connect:** compare `.env` URLs with the host ports above. Inside Docker, services use container names and internal ports instead.
