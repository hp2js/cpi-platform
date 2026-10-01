# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

CPI Platform: corruption prevention reporting and review workspace (HP2JS Adili V3 Track 2). pnpm monorepo, Node per `.nvmrc`, pnpm via Corepack. The product spec is `docs/HP2JS — Adili-V3-Track-2-PRD.md` (sections like §17.1, acceptance tests AT01–AT31 and requirements FR01–FR15 are referenced throughout code and docs).

## Commands

```sh
pnpm install --frozen-lockfile
pnpm services:up          # PostgreSQL, Redis and MinIO (private bucket provisioned) in Docker
pnpm dev                  # contracts, API and web in watch mode (web: http://localhost:5180)
pnpm check                # lint, typecheck, unit tests, builds, Nest DI metadata check — run before finishing
pnpm format               # Prettier
pnpm test:e2e             # Playwright against a running dev stack (http://127.0.0.1:5180)
pnpm docker:up            # full stack in Docker instead of on the host
```

- One workspace: `pnpm --filter @cpi/web test`, `pnpm --filter @cpi/api test`.
- Single unit test file / name: `pnpm --filter @cpi/web exec vitest run src/mocks/annual.test.ts -t "<name>"`.
- Single e2e spec: `pnpm exec playwright test e2e/thin-path.spec.ts`.
- `@cpi/contracts` must be built (`pnpm --filter @cpi/contracts build`) before API/web typecheck or tests; the root scripts do this for you.
- DB: `pnpm db:generate` (Drizzle SQL from `apps/api/src/database/schema.ts`, run on the host and commit SQL + metadata together), `pnpm db:migrate`, `pnpm db:seed`. Never use schema push. `pnpm db:reset --confirm-local-data-loss` wipes local volumes.

## Architecture

- `packages/contracts` — zod schemas and types shared by API and web. `src/draft/` is the API contract (HP2-9), implemented by both the real API and the mock; `src/domain/` holds pure rules both use (scoring, day counting, CSV, completeness, form revisions, plan proposals and import), so they cannot drift; `src/fixtures/` is the fictional seed (`@cpi/contracts/fixtures`) that the API's `loadFixtures` and the mock's `db.ts` both load.
- `apps/api` — NestJS, the real backend: one controller per module under `src/` (auth, directory, cycle, reporting, review, planning, annual, events, simulation, supervision, admin, dev), Drizzle/Postgres + Redis `Infrastructure`, file bytes in an S3-compatible bucket (MinIO locally) through `storage/files.ts` (`Files.withUpload` to write, `Files.read` to read; PostgreSQL keeps only metadata and the object location, see `docs/storage.md`), global prefix `/api`, JSON logs with `X-Request-ID`. Writes go through `write(db, (tx, businessTime) => …)`, which holds the single write lock and supplies business time. Integration tests (`*.int.test.ts`, `pnpm --filter @cpi/api test:integration`, needs `pnpm services:up`) run against Postgres, Redis and MinIO and are ported from the mock's tests. Validate input with `SchemaValidationPipe(zodSchema)`; errors use the envelope `{ message, fieldErrors?, requestId?, code? }` and must never echo submitted content. `scripts/check-compiler.mjs` asserts constructor-injection metadata survives the build.
- `apps/web` — Vite/React, TanStack Router (code-based, one guarded subtree + layout per role: institution, officer, supervisor, admin), TanStack Query, TanStack Form, TanStack Table **v9** (`useTable` + `tableFeatures`, not v8 `useReactTable`), Tailwind v4 + shadcn (`src/components/ui`). Screens in `src/routes/<role>/`, domain queries/components in `src/features/<domain>/`. All requests go through `src/lib/api.ts` `request(path, schema)`, which validates responses against contracts.
- **The web app calls the real API by default.** `apps/web/src/mocks/` (MSW) is a full second implementation of the contract, used by Vitest and, with `VITE_API_MODE=mock`, in development; otherwise the development service worker only injects network faults. `db.ts` (seeded fictional cycle, localStorage), `services/` (scope, business clock, workflow — business rules live here or in `@cpi/contracts` domain, never in components), `handlers/` (REST routes). A behaviour change goes into both the API and the mock (put shared rules in `packages/contracts/src/domain/`), with an integration test in `apps/api` and a unit test in the mock. `pnpm test:e2e` runs against the real API. `docs/api-handover.md` lists every endpoint and rule.
- `src/mocks/scenario.ts` plays the scripted PRD §17.1 year; `annual.test.ts` asserts its expected results (88.75, 70.00, 96.25 …).

## Rules the code relies on

- The frontend never computes authoritative scores, deadlines or state transitions; it renders what the API returns. Scores are `{ status: 'pending', reason }` or `{ status: 'calculated', fraction, points }` — pending is never shown as zero. No scores in institution-facing responses before publication.
- Out-of-scope reads return 404 (no leakage); forbidden actions 403. Drafts/reviews use optimistic concurrency (`baseVersion`/`revision`, `409 version_conflict`); submit requires `Idempotency-Key`.
- Query keys include every filter, institution and period that affects the response; invalidate specific query families after mutations. Filters/sort/tabs live in validated route search params.
- Theme tokens only in `apps/web/src/styles.css`. Accessibility is tested (axe WCAG 2.2 AA, keyboard, 390 px no horizontal scroll) — keep labels, focus, `aria-*`, and never convey status by colour alone.
- Adding shadcn components: `pnpm dlx shadcn@4.21.0 add <component> -c apps/web`, then remove the stray `cn` package it installs and point imports back to `@/lib/utils`; never let it overwrite existing components.
- Versions are pinned exactly (packages, images, Actions). Each workspace declares the tools its scripts call (Docker installs per-app dependency graphs). Native builds are allowlisted in `pnpm-workspace.yaml`.
- Synthetic data only — never real institution records or personal data.

See `docs/frontend.md`, `docs/frontend-plan.md`, `docs/frontend-verification.md`, `docs/prd-coverage.md`.
