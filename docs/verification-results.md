# Verification results: authorization, uploads, concurrency and recovery

Run on 2 October 2026 on the local demonstration environment (the chosen demo environment; nothing is publicly hosted, so TLS was not in scope). Every result below is from an actual run; nothing is extrapolated.

## Environment

| Item     | Value                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host     | macOS, Docker 28.5.1, Node 24.21.0                                                                                                                                                                     |
| Services | Compose PostgreSQL, Redis and MinIO (private bucket, scoped application user)                                                                                                                          |
| Branch   | `feature/storage-n-notification`                                                                                                                                                                       |
| Data     | Fictional fixtures only. E2E ran against a separate `cpi_demo` database, Redis index 1 and object prefix `evidence/e2e/`, with `ADMIN_EMAIL` and `RESEND_API_KEY` empty so no real email could be sent |

## Runs

| Run                      | Command                                                            | Commit    | Result                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, types, unit, build | `pnpm check`                                                       | `3fb46ed` | Passed: contracts 15, API 14, web 164 unit tests                                                                                                                                                         |
| Integration              | `pnpm --filter @cpi/api test:integration`                          | `3fb46ed` | **125/125 passed** (23 files, 164 s); cookie-flag assertions added after, `directory.int.test.ts` re-run and passed                                                                                      |
| Dependency outages       | `pnpm test:smoke` (full Compose stack)                             | `5ba699d` | Passed: Redis, PostgreSQL and MinIO each stopped and recovered; Redis outage answers `503 session_store_unavailable`; PostgreSQL data persists across restart                                            |
| End-to-end (real API)    | `pnpm test:e2e`                                                    | `a9668db` | **69 passed, 2 skipped, 0 failed** (8.4 min). Skipped by design: a mock-only browser-storage test and the Caddy production-image test (run by `pnpm test:e2e:prod` in CI)                                |
| Failed migration         | `pnpm db:migrate` on a throwaway database with a conflicting table | `a565853` | Printed `Database migration failed (42P07: relation "institution_types" already exists). No migration was applied and the database is unchanged.`, exit 1; the database held only the pre-existing table |
| Log scan                 | 5,301 API log lines from the e2e run                               | `a9668db` | No demo password, sign-in code, link token, file content, session ID or storage/database credential. Request logs carry method, status, duration and request ID only, never paths or bodies              |

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

| Defect                                                                                          | Class                      | Fixed in  |
| ----------------------------------------------------------------------------------------------- | -------------------------- | --------- |
| An email delivery error inside the business transaction could roll back the change it described | Data loss                  | `5b0eb3e` |
| A Redis outage answered a generic 500                                                           | User-visible failure       | `4692919` |
| A renamed ZIP was accepted as DOCX/XLSX; incomplete or encrypted files were accepted            | Upload safety              | `5ba699d` |
| A configuration error was reported as `DEPENDENCY_ERROR` by the new error handlers              | Operability                | `a565853` |
| Demo mode alone could reset any database                                                        | Data loss (reset boundary) | `a9668db` |

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
