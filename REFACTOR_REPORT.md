# API refactor report (Phase 4)

Branch `feature/backend-cleanup`, from `13f6a8c` to HEAD: 17 commits, one per step, each verified with lint, typecheck, unit tests, the full integration suite, the Nest DI metadata check, and `drizzle-kit generate` (no schema change every time). The audit and the decisions behind this work are in `REFACTOR_AUDIT.md`.

## What changed, per module

| Module        | Now                                                                                                                                       | Notes                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cross-cutting | `InfrastructureModule` (global): `CONFIG`, `DB` token, `Infrastructure`, `Objects`, `Files`, `Mailer`, `Events`. `AppModule` only imports | `configProvider` is the server's single `process.env` read. `SchemaValidationPipe(schema, invalid?)` keeps endpoint-specific 422s; `invalidBody()` helper        |
| admin         | `AdminService`, `AdminRepository`                                                                                                         | Audit CSV uses `@Header` instead of `@Res()`; exact headers now pinned by test                                                                                   |
| events        | `EventsService`, `EventsRepository`; `EventsModule` exports `DeliveryWorker`                                                              |                                                                                                                                                                  |
| dev           | `DevService`, `DevRepository`, `DevEnvironmentGuard`                                                                                      | Lockout reset moved into `Sessions.clearAllFailures()`. **New** characterisation test `dev.int.test.ts`, verified against the old controller first               |
| directory     | `DirectoryService`, `DirectoryRepository`                                                                                                 | Client-facing institution column map lives in the repository                                                                                                     |
| supervision   | `SupervisionService`, `SupervisionRepository`                                                                                             | All six bodies via pipes. Bulk assignment: N+1 `currentAssignment` loop replaced by one `inArray` query                                                          |
| reporting     | `ReportingService`, `ReportingRepository`                                                                                                 | `@IdempotencyKey()` param decorator; submission's six writes are one repository method inside the service's transaction; file streaming keeps `@Res()` (allowed) |
| review        | `ReviewService`, `ReviewRepository`                                                                                                       | `@Override()` param decorator replaces 7× `@Req()`                                                                                                               |
| planning      | `PlanningService`, `PlanEditorService`, `FoundationsService` + one repository each                                                        | `OwnInstitutionGuard` (404 before body validation) lets plan-editor bodies move to pipes; precedence pinned by a new assertion                                   |
| annual        | `AnnualService`, `AnnualRepository`                                                                                                       | CSV exports return strings; controller sets download headers (`@Res({ passthrough: true })`); exact headers pinned by test                                       |
| cycle         | `FormsService`, `SettingsService`, `PeopleService` + one repository each                                                                  | The 1,372-line settings controller is split by concern: profiles/calendar/risk scale vs users/institutions/types. Routes unchanged                               |
| simulation    | `SimulationService`, `SimulationRepository`, `DemoEnvironmentGuard`                                                                       | Unit test now exercises the guard                                                                                                                                |
| auth          | `SessionService`, `AccountService`, `AuthRepository`                                                                                      | Controllers keep only the session cookie and the 200/202 sign-in status                                                                                          |
| health        | unchanged controller in `HealthModule`                                                                                                    | Kept at `src/health.controller.ts` because `scripts/check-compiler.mjs` loads it by path                                                                         |

## Architectural decisions

- **Repository per feature** (as you chose). Repositories are the only feature code that imports Drizzle tables. Methods take an optional `db: Db = this.db` executor, so services compose them inside one `write()` transaction. That keeps the single write lock and business time unchanged.
- **Services own transactions** through the existing `write()` helper. No repository opens a transaction.
- **Shared read helpers stay as functions.** `auth/scope.ts`, `review/data.ts`, `annual/data.ts`, `reporting/report.ts`, `planning/plans.ts`, `database/state.ts`, `events/events.ts` (recipients) and `cycle/onboarding.ts` take a `Db` and are called by several services. They work as shared repositories already. Converting them to injectables would have doubled the diff without changing behaviour (see tech debt).
- **Validation stays zod** (as you chose): contract schemas from `@cpi/contracts` act as DTOs through `SchemaValidationPipe`. No class-validator and no `@nestjs/config`, because `config.ts` already validates the environment with zod and fails fast.
- **Response shaping:** contracts are already explicit. Repositories select safe column sets or the service maps rows (users, institutions, evidence) before returning. No raw user row reaches a client. A `ClassSerializerInterceptor` would do nothing on Drizzle's plain objects, so none was added.
- **Validation order is part of the contract.** A body is moved to a pipe only when the old handler validated it before any scope, ownership or state check. Where a 404 or 403 used to win over a 422, the body stays `unknown` and the service parses it at the same point. Guards (`OwnInstitutionGuard`, `DevEnvironmentGuard`, `DemoEnvironmentGuard`) replaced checks that depended only on the user, route or config, because guards run before pipes.

## Metrics

| Metric                               | Before                         | After                                                     |
| ------------------------------------ | ------------------------------ | --------------------------------------------------------- |
| Lint errors / warnings               | 0 / 0                          | 0 / 0                                                     |
| `any` in `apps/api/src`              | 0                              | 0                                                         |
| Controller lines (17 files)          | 7,942                          | 1,928                                                     |
| Longest controller method            | 206 lines (reporting `submit`) | 29 lines, mostly decorators; handler bodies are 1–5 lines |
| DB/ORM references in controllers     | ~360                           | 0                                                         |
| `@Req()` / non-streaming `@Res()`    | 10 / 2 (CSV)                   | 2 (`signOut`, `dev reset`: session cookie) / 0            |
| API tests (unit + integration)       | 14 + 115 = 129                 | 15 + 118 = 133, all passing                               |
| Web + contracts tests (`pnpm check`) | 164 + 90                       | 164 + 90, all passing                                     |
| Coverage                             | not configured                 | not configured                                            |
| `drizzle-kit generate`               | no changes                     | no changes                                                |

## Behaviour differences introduced (small, disclosed)

1. `GET /evidence/:id/file`: `Cache-Control: private, no-store` used to be set before the storage read, so a 503 from storage carried it. It is now set only on successful file responses. Every other status, header and body is the same.
2. Bulk assignment reads current assignments in one query. The result is the same; it is just faster.

## Proposed breaking changes (not applied)

1. **Validate every body at the edge.** 25 handlers still take `@Body() body: unknown` and validate in the service: review ×9, planning ×5, reporting ×2, forms ×2, foundations ×2, session ×2, annual close-nonresponse, settings profile edit, simulation advance. Moving them to pipes would make a malformed body on an out-of-scope or locked resource answer 422 instead of 404, 403 or 409. That is arguably more correct, but it is observable and the mock (`apps/web/src/mocks`) would need the same change.
2. **Validate query parameters.** `GET /audit` and `/audit.csv`, `/evidence`, `/oversight`, `/reviews?status`, `/admin/deliveries?status` and `/obligations?institutionId` are typed but not validated. A repeated parameter (`?q=a&q=b`) becomes an array, and `/audit` then fails with a **500** (`TypeError` on `query.q.trim`; reproduced, and present before the refactor). A zod query schema would return 422 instead. That is a status change for malformed requests, and the mock should match.
3. **Simulation advance:** a malformed body currently answers 404 (unknown boundary). A 422 would be clearer.

## Open questions

- Should shared read helpers (item 1 under tech debt) become injectable repositories, or is "functions taking `Db`" the house style? They mirror the mock's `services/` layout, which keeps the API and the mock easy to compare.
- `forbidNonWhitelisted` has no direct counterpart: zod objects strip unknown keys. Switching contracts to `z.strictObject` would reject extra fields. That would be a contract change for both clients, so it is not proposed here.

## Remaining tech debt and next steps

1. Shared `Db` helper modules still query tables directly (listed above), as do the CLI scripts (`migrate`, `seed`, `invite-admin`, `storage/maintenance`) and `fixtures.ts`. The CLI scripts also read `process.env` and use `console`, which is expected for operator tools outside Nest.
2. Some controller methods return inferred types (planning, plan-editor, forms update/publish/create, settings profile writes, supervision bulk). Add explicit contract types when touching them.
3. Repositories use `row!` after `insert … returning()`, which is safe because an insert returns its row. Updates by id follow a lookup in the same transaction under the write lock.
4. No Swagger (contracts are documented in `docs/api-handover.md`). No `@nestjs/throttler`: sign-in has its own Redis lockout, and other endpoints are unthrottled. No explicit CORS: the web app is same-origin through its proxy. Add these if the API is ever exposed directly.
5. The Playwright e2e suite (`pnpm test:e2e`) was **not run**. It needs the dev stack rebuilt with this branch. The integration suite exercises every route over HTTP against Postgres, Redis and MinIO, but run e2e before merging.
6. No coverage tooling is configured; `vitest --coverage` would need `@vitest/coverage-v8`.

## Definition of Done

- [x] Controllers: no business logic, ORM calls, error-formatting `try/catch`, or `@Res()` except file and session-cookie handling
- [~] Bodies validated by pipes where order allows; 25 validated in services by design (proposed change 1); query DTOs not validated (proposed change 2)
- [x] No entity with sensitive fields returned raw
- [x] Global exception filter with one error envelope (pre-existing)
- [x] Config validated at startup; the server reads `process.env` only in `configProvider`
- [x] Auth and roles via guards and decorators; data-dependent ownership checks stay in services
- [x] No `console.log` in the server, no `new Service()` in DI code, no circular deps
- [x] Feature modules; lean `AppModule`
- [x] One Drizzle instance for the server (`DB` token); CLI and test harness create their own outside Nest
- [~] Feature queries live in repositories; shared `Db` helpers remain (tech debt 1)
- [x] Client-facing queries select safe columns or are mapped; multi-step writes use `write()` transactions
- [x] `drizzle-kit generate`: no new migration
- [x] Build, lint and all tests pass (`pnpm check`, integration suite)
- [~] API contract verified by the integration suite; e2e not run (tech debt 5)
- [x] `REFACTOR_AUDIT.md` and `REFACTOR_REPORT.md` written
