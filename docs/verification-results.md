# Verification results: authorization, uploads, concurrency, recovery and performance

Run on 2 October 2026 on the local demonstration environment (the chosen demo environment; nothing is publicly hosted, so TLS was not in scope). Every result below is from an actual run; nothing is extrapolated.

## Environment

| Item     | Value                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host     | macOS, Docker 28.5.1, Node 24.21.0                                                                                                                                                                     |
| Services | Compose PostgreSQL, Redis and MinIO (private bucket, scoped application user)                                                                                                                          |
| Branch   | `feature/storage-n-notification`                                                                                                                                                                       |
| Data     | Fictional fixtures only. E2E ran against a separate `cpi_demo` database, Redis index 1 and object prefix `evidence/e2e/`, with `ADMIN_EMAIL` and `RESEND_API_KEY` empty so no real email could be sent |

## Runs

| Run                        | Command                                                                                                                                                                                                                              | Commit    | Result                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, types, unit, build   | `pnpm check`                                                                                                                                                                                                                         | `3fb46ed` | Passed: contracts 15, API 14, web 164 unit tests                                                                                                                                                                                                                                                                    |
| Integration                | `pnpm --filter @cpi/api test:integration`                                                                                                                                                                                            | `3fb46ed` | **125/125 passed** (23 files, 164 s); cookie-flag assertions added after, `directory.int.test.ts` re-run and passed                                                                                                                                                                                                 |
| Dependency outages         | `pnpm test:smoke` (full Compose stack)                                                                                                                                                                                               | `5ba699d` | Passed: Redis, PostgreSQL and MinIO each stopped and recovered; Redis outage answers `503 session_store_unavailable`; PostgreSQL data persists across restart                                                                                                                                                       |
| End-to-end (real API)      | `pnpm test:e2e`                                                                                                                                                                                                                      | `a9668db` | **69 passed, 2 skipped, 0 failed** (8.4 min). Skipped by design: a mock-only browser-storage test and the Caddy production-image test (run by `pnpm test:e2e:prod` in CI)                                                                                                                                           |
| Pre-push CI replay (3 Oct) | CI steps in order: format, `pnpm check`, hadolint, Compose config; Compose stack in demo mode on `cpi_demo`: `pnpm test:smoke`, `pnpm test:integration`, `pnpm test:e2e`; production images: `pnpm test:smoke`, `pnpm test:e2e:prod` | `a1e34a5` | All passed: smoke ×2; **125/125** integration; e2e **69 passed, 2 skipped** against the containers; production e2e **5 passed** (66 dev-only specs skipped by design). Under heavy host load (load average ≈ 15) `pnpm check` once timed out 4 web tests; they passed on re-run and take the same time as on `main` |
| Failed migration           | `pnpm db:migrate` on a throwaway database with a conflicting table                                                                                                                                                                   | `a565853` | Printed `Database migration failed (42P07: relation "institution_types" already exists). No migration was applied and the database is unchanged.`, exit 1; the database held only the pre-existing table                                                                                                            |
| Log scan                   | 5,301 API log lines from the e2e run                                                                                                                                                                                                 | `a9668db` | No demo password, sign-in code, link token, file content, session ID or storage/database credential. Request logs carry method, status, duration and request ID only, never paths or bodies                                                                                                                         |

## Acceptance criteria

### Unauthorized access and changed sessions

| Check                                                                                                                         | Evidence                                                                                                              | Result |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ |
| Out-of-scope institution, obligation and assignment reads answer 404/403                                                      | `directory.int.test.ts` (AT01, AT02); `supervision.int.test.ts` "scopes supervisors to their institutions everywhere" | Pass   |
| Out-of-scope file download answers 404; drafts private; administrator only after audited support view                         | `storage.int.test.ts`, `files.int.test.ts`, `reporting.int.test.ts` "keeps drafts private to the institution"         | Pass   |
| Evidence lookup returns no out-of-scope files or counts                                                                       | `reporting.int.test.ts` "lists only files in the caller's scope" (FR15)                                               | Pass   |
| Exports: no results CSV before release; own institution's rows only; officers refused consolidated, results and audit exports | `annual.int.test.ts` (AT18–AT20), `simulation.int.test.ts` (FR11)                                                     | Pass   |
| A session opened before a reassignment loses the institution, its obligations and evidence on the next request                | `simulation.int.test.ts` "moves access at once…" (AT22)                                                               | Pass   |
| Deactivation ends the account's session; role change ends all sessions                                                        | `cycle.int.test.ts` "creates an account and ends a deactivated account's session"; `Sessions.endAllFor`               | Pass   |

### Malformed files, outages, duplicates and races

| Check                                                                                                                | Evidence                                                                 | Result |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ |
| Renamed executable refused (AT21)                                                                                    | `reporting.int.test.ts`; e2e `thin-path.spec.ts`                         | Pass   |
| Damaged, password-protected, macro/script-carrying, renamed-ZIP Office files refused; real Office/PNG files accepted | `packages/contracts/src/domain/uploads.test.ts`                          | Pass   |
| Uploads refused outside demo mode until real documents are approved                                                  | `auth.int.test.ts` "refuses uploads until real documents are approved"   | Pass   |
| Storage outage: upload fails retryably, metadata and history intact, staged object cleaned                           | `storage.int.test.ts`; smoke (MinIO)                                     | Pass   |
| Redis outage: `503 session_store_unavailable`, no details leaked                                                     | `auth/sessions.test.ts`; smoke (Redis)                                   | Pass   |
| Email failure never undoes the business change; worker resumes interrupted rows exactly once                         | `simulation.int.test.ts` (HP2-43, AT12); e2e `safeguards.spec.ts` (AT12) | Pass   |
| Duplicate submit returns the original receipt (AT06); duplicate upload returns the same record                       | `reporting.int.test.ts`; e2e `recovery.spec.ts`                          | Pass   |
| Stale draft and form saves, stale review decisions answer `409 version_conflict` (AT10)                              | `reporting.int.test.ts`, `revisions.int.test.ts`, `review.int.test.ts`   | Pass   |

### Private storage, logs, secrets and sessions

| Check                                                                                                                                                                                                                                         | Result                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Bucket is private; API uses a scoped user; downloads go through the authorized endpoint with `Cache-Control: private, no-store` (`storage.int.test.ts`)                                                                                       | Pass                                                                                |
| Logs hold no secrets or submitted content (log scan above; `http/validation.test.ts`)                                                                                                                                                         | Pass                                                                                |
| Session cookie is `HttpOnly`, `SameSite=Lax`, `Path=/api` (`directory.int.test.ts`; `Secure` is set when `NODE_ENV=production`, by code review); IDs are 256-bit random; secrets come only from environment variables, none in browser assets | Pass                                                                                |
| TLS                                                                                                                                                                                                                                           | Not applicable: loopback-only local environment; required before any public hosting |

### Blocking defects

None open. No isolation, data-loss, score or publication defect was found. The scripted year still produces the expected annual results (88.75, 70.00, 96.25 …) in `simulation.int.test.ts`.

Defects found and fixed during this verification:

| Defect                                                                                                                                           | Class                      | Fixed in                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------- |
| An email delivery error inside the business transaction could roll back the change it described                                                  | Data loss                  | `5b0eb3e`                                                             |
| A Redis outage answered a generic 500                                                                                                            | User-visible failure       | `4692919`                                                             |
| A renamed ZIP was accepted as DOCX/XLSX; incomplete or encrypted files were accepted                                                             | Upload safety              | `5ba699d`                                                             |
| A configuration error was reported as `DEPENDENCY_ERROR` by the new error handlers                                                               | Operability                | `a565853`                                                             |
| Demo mode alone could reset any database                                                                                                         | Data loss (reset boundary) | `a9668db`                                                             |
| The Compose default database name moved to `cpi_demo`, so a Docker stack whose `.env` omitted `POSTGRES_DB` silently switched away from its data | Data availability          | Found in the pre-push replay; Compose default restored to `cpi_local` |

## Limits of this verification

- E2E ran the API and web on the host (`pnpm dev`), not in containers; CI runs the same suite against the Compose stack and the production images.
- Upload checks are structural, not antivirus scanning; names inside compressed PDF object streams are not inspected. Real documents remain gated (`REAL_DOCUMENT_UPLOADS`).
- Sign-in throttling is per email; per-IP limits belong to a hosted proxy.
- No public environment was deployed, so TLS, hosted secrets management and backups were not exercised.

## Reproducing

```sh
pnpm services:up && pnpm check && pnpm --filter @cpi/api test:integration
pnpm docker:up && pnpm test:smoke
# E2E needs demo mode on a disposable *_demo database; it resets that database.
pnpm test:e2e
```

# Performance: p95 at 20 concurrent users (PRD §4.2)

Run on 7 October 2026. Target: ordinary reads and writes have p95 under 2 seconds at 20 concurrent users, excluding upload transfer and external providers. **Result: met in both runs, at the eight-institution demo data volume.** Scale is the 500-institution rehearsal's question and is not claimed here.

## Setup

| Item            | Value                                                                                                                                                                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hardware        | Apple M1, 8 cores, 8 GB, macOS (Darwin 27.0.0), Node 24.21.0. The load generator ran on the same machine, and the development Compose stack was also running (web and API containers at about 17% CPU each)                                                                                                           |
| Deployment mode | The compiled API (`node dist/main.js`, one process) on the host, as the integration tests run it. PostgreSQL, Redis and MinIO in the local Docker Compose services. `NODE_ENV=test` only changes the cookie `secure` flag and production guards                                                                       |
| Data            | Fictional fixtures: 8 institutions, 2 officers, 1 supervisor. Restored at the start of each round in the run's own `<database>_test` database and Redis index 15, never the demo database. The demo database's audit, submission, decision and publication counts were the same before and after the run (7, 2, 0, 0) |
| Code            | API at `a47991a`; the load test is `apps/api/src/load/load.int.test.ts`                                                                                                                                                                                                                                               |

**Method.** Five rounds. Each round keeps 20 users busy at once:

1. 8 institution users each save their Q1 draft five times and submit it, while 12 readers loop: 4 officer queues, 4 supervisor dashboards (unfiltered and filtered by period, institution and officer), and 4 administrator annual evaluations.
2. 8 officer users each accept every milestone and finalize one submission, while the same 12 readers keep looping.

Every request is timed from the client. A status of 400 or more counts as an error, and any error fails the run with its cause. Percentiles are nearest-rank. Evidence uploads, suitability checks and seeded-baseline confirmation are setup and are not timed: the target excludes upload transfer.

## Results (milliseconds)

Run 1:

| Journey                            | Requests | p50 | p95 | p99 | Errors | Target |
| ---------------------------------- | -------: | --: | --: | --: | -----: | ------ |
| institution: draft save            |      200 | 164 | 348 | 400 |   0.0% | met    |
| institution: submit                |       40 | 335 | 463 | 515 |   0.0% | met    |
| officer: queue                     |      915 | 110 | 180 | 292 |   0.0% | met    |
| officer: review decision           |      160 | 340 | 397 | 405 |   0.0% | met    |
| officer: finalize                  |       40 | 473 | 594 | 625 |   0.0% | met    |
| supervisor: dashboards and filters |      914 | 109 | 177 | 278 |   0.0% | met    |
| administrator: annual evaluation   |      913 | 109 | 177 | 271 |   0.0% | met    |

Run 2, repeated straight after:

| Journey                            | Requests | p50 | p95 | p99 | Errors | Target |
| ---------------------------------- | -------: | --: | --: | --: | -----: | ------ |
| institution: draft save            |      200 | 146 | 213 | 228 |   0.0% | met    |
| institution: submit                |       40 | 289 | 401 | 485 |   0.0% | met    |
| officer: queue                     |      926 | 107 | 192 | 287 |   0.0% | met    |
| officer: review decision           |      160 | 371 | 597 | 754 |   0.0% | met    |
| officer: finalize                  |       40 | 586 | 775 | 824 |   0.0% | met    |
| supervisor: dashboards and filters |      922 | 109 | 197 | 290 |   0.0% | met    |
| administrator: annual evaluation   |      921 | 108 | 200 | 279 |   0.0% | met    |

No journey is over target, so no issue is filed for this run.

## Limits

- **Data volume.** Eight institutions only; the 500-institution rehearsal measures scale.
- **Sample size.** Submit and finalize have 40 samples each (one per institution per round), so their p99 is close to their maximum.
- **Write lock.** Every write waits for the single write lock, so the slowest writes (finalize, review decisions) are where contention would show first as concurrency rises.
- **Same machine.** Client, API and services share one machine, so no network latency is included. A hosted run would add it.

## Rerun

```sh
pnpm services:up
LOAD_OUT=load-results.json pnpm --filter @cpi/api test:load   # LOAD_ROUNDS and LOAD_SAVES change the volume
```

The results, the environment (date, commit, CPU, memory, Node) and the first error of any journey are written to `LOAD_OUT`.
