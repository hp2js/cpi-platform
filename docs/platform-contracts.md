# Platform contracts: authentication, storage and delivery

Status: HP2-10 · Applies to `apps/api` as built. Endpoint shapes are in [`api-handover.md`](api-handover.md), file storage in [`storage.md`](storage.md).

This records what the demonstration relies on and what remains a decision for a hosted deployment. Nothing here assumes an external identity provider, a managed queue or a real mail service.

## Authentication and sessions

| Concern             | Behaviour                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity            | Local accounts only: email, password and an emailed 6-digit code. eCitizen is listed as `planned` and never contacted ([`api-handover.md`](api-handover.md#authentication-prd-131)).                                                                                                 |
| Passwords           | scrypt (N=2^17, r=8, p=1) with a per-password salt; parameters stored with the hash (`auth/passwords.ts`). Invitations, resets and sign-in codes store only hashes.                                                                                                                  |
| Session             | An opaque 256-bit ID in the `cpi_session` cookie (`HttpOnly`, `SameSite=Lax`, `Path=/api`, `Secure` when `NODE_ENV=production`). Redis maps it to a user ID with a sliding idle timeout, `SESSION_TTL_SECONDS` (8 hours by default). Every request rereads the user from PostgreSQL. |
| Throttling          | Five failed sign-ins or codes for an email lock it for 15 minutes, whether or not the account exists. There is no per-IP limit; a hosted deployment should add one at the proxy.                                                                                                     |
| Demo mode           | `DEMO_MODE=true` adds one-click demo accounts and the published demo password, and accepts only `@example.invalid` addresses. A hosted deployment with real people runs with `DEMO_MODE=false`.                                                                                      |
| Cross-site requests | The browser reaches the API on the portal's own origin (`/api` via the Vite proxy locally and Caddy in the production image), and `SameSite=Lax` keeps the cookie off cross-site writes. There is no separate CSRF token.                                                            |

### Revocation

| Event                                  | Effect                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Sign out                               | That session is deleted.                                                                                       |
| Idle for `SESSION_TTL_SECONDS`         | The session expires; the next request gets `401 session_expired`.                                              |
| Account deactivated                    | Immediate: sessions resolve only to active users.                                                              |
| Role or institution changed            | Every session of that user ends (`Sessions.endAllFor`); the new role applies from the next sign-in.            |
| Officer reassigned, supervisor changed | Immediate, without signing out: scope is computed from current assignments on every request (`auth/scope.ts`). |

### Role scopes

Four roles: institution focal person, prevention officer, supervisor and administrator. Scope rules are in [`api-handover.md`](api-handover.md#cross-cutting-rules) and `auth/scope.ts`: out-of-scope reads answer `404`, forbidden actions `403`.

## Redis

Redis holds short-lived security state only. Losing it signs everyone out and clears lockouts; no business record is lost.

| Key                                        | Holds                                     | Lifetime         |
| ------------------------------------------ | ----------------------------------------- | ---------------- |
| `session:{id}`                             | User ID of a session                      | Sliding idle TTL |
| `user-sessions:{userId}`                   | That user's session IDs, for revocation   | Until revoked    |
| `signin-code:{id}`                         | Hash of an emailed sign-in code, attempts | 10 minutes       |
| `login-fail:{email}`, `login-lock:{email}` | Sign-in throttling                        | 15 minutes       |

Redis is not a queue, cache or lock: the write lock and the notification outbox are in PostgreSQL. Compose runs Redis with append-only persistence, so sessions survive a Redis restart locally.

## Private evidence storage

Described in [`storage.md`](storage.md). The contract the rest of the system relies on:

- Bytes live in a private S3-compatible bucket under random keys; PostgreSQL keeps the metadata, SHA-256 and object location. The browser never receives storage credentials or object URLs.
- Uploads (`POST /api/obligations/:id/evidence`, `POST /api/institutions/:id/foundations`) pass file-type, size and content checks (renamed, damaged, password-protected and macro- or script-carrying files are refused); a record is saved only after its object is stored. Outside demo mode they answer `403 uploads_not_approved` until `REAL_DOCUMENT_UPLOADS=true` records that scanning and a production review are approved.
- `GET /api/evidence/:id/file` is the only way to read a file. It checks scope on every request (the institution: its own files; officers, supervisors and administrators in scope: submitted evidence and foundation documents; administrators: a draft's files only after an audited support view), answers `404` otherwise, audits administrator access, verifies size and hash, and sends `Cache-Control: private, no-store`.

## Notification delivery

Workflow notifications (FR11) are an in-app inbox plus an email summary written to a controlled sink. They never contain evidence, links with secrets or unreleased scores.

1. **Outbox.** In the transaction of the business change, `Events.notify` inserts one `notifications` row per recipient (unique per event and recipient) and one `deliveries` row (unique `key` = event, recipient and channel) with status `queued`. Replaying an event inserts nothing new.
2. **Worker.** One `DeliveryWorker` runs inside the API process (`events/delivery-worker.ts`). Every second it selects due `queued` or `retrying` rows and attempts each in its own write transaction, rechecking the row first. A delivery failure or a crashed worker therefore cannot undo the business change.
3. **Retry.** Three attempts: immediately, then after 30 s and 2 min of real time (`DELIVERY_RETRY_DELAYS_MS`, default `30000,120000`). After the third failure the row is `failed` and appears in the failure queue (`GET /api/admin/deliveries?status=failed`), where an administrator can retry it once at a time (audited).
4. **Restart.** Rows are the queue: anything `queued` or `retrying` when the API stops is attempted after it starts again.

States: `queued → delivered`, or `queued → retrying → … → delivered | failed`; a manual retry takes `failed → delivered | failed`.

Several API replicas would each run a worker; the recheck under the write lock keeps a row from being attempted twice. In development, `POST /api/__mock/deliveries/run` attempts waiting retries immediately, and `POST /api/__mock/email-failure` makes the sink reject messages (both unavailable in production and outside demo mode).

**Account emails are separate.** Temporary passwords, sign-in codes and reset links carry secrets, so they are never stored in the outbox. They are sent once the change commits: through Resend when `RESEND_API_KEY` is set, otherwise to the same local sink. This is the only path that can reach a real address; leave the key empty for the demonstration.

## Secrets and configuration

Secrets are environment variables read by the API; none are bundled into browser assets. `.env.example` lists local defaults, which are for local use only.

| Variable                                                                      | Secret | Purpose                                                                   |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| `DATABASE_URL`, `POSTGRES_PASSWORD`                                           | Yes    | PostgreSQL                                                                |
| `REDIS_URL`                                                                   | Yes    | Redis (include credentials if the host requires them)                     |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                                    | Yes    | Scoped bucket credentials; never administrator credentials                |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`                                      | Yes    | Local MinIO provisioning only                                             |
| `RESEND_API_KEY`                                                              | Yes    | Account emails; empty keeps them in the sink                              |
| `DEMO_MODE`, `ADMIN_EMAIL`, `ADMIN_NAME`                                      | No     | Seeding and demo sign-in (see `api-handover.md`)                          |
| `REAL_DOCUMENT_UPLOADS`                                                       | No     | Uploads outside demo mode; true only after scanning and production review |
| `PORTAL_URL`, `EMAIL_FROM`, `SESSION_TTL_SECONDS`, `DELIVERY_RETRY_DELAYS_MS` | No     | Links, sender, session lifetime, delivery backoff                         |

Logs are JSON with a request ID. They record error codes, never request bodies, passwords, codes, email content or file contents.

## Hosting assumptions

- **Local demonstration** is the supported environment: `pnpm docker:up` or `pnpm services:up` + `pnpm dev`, with synthetic data, `DEMO_MODE=true` and no `RESEND_API_KEY`. Services listen on `127.0.0.1` only, so TLS is not needed.
- `pnpm docker:prod` verifies the hardened production images locally. It is not a deployment configuration.
- A **hosted** deployment additionally needs TLS at the proxy (the `Secure` cookie depends on it), managed secrets, a private bucket with scoped credentials, backups of PostgreSQL and the bucket together, per-IP throttling, and the real-document controls in [`storage.md`](storage.md) (scanning and retention) before any real record is uploaded.

## When a dependency fails

Liveness (`/api/health/live`) stays up; readiness (`/api/health/ready`) answers `503` naming the service that is down, and the administrator home page shows it.

| Down           | What users see                                                                                                                                                          | What is kept                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| PostgreSQL     | Requests fail with "An unexpected server error occurred." and a request ID.                                                                                             | Committed records; a failed write is rolled back whole.                                              |
| Redis          | Sign-in and every signed-in request answer `503 session_store_unavailable`: "Sign-in is temporarily unavailable. Please try again shortly." Screens keep unsaved input. | All records. Sessions persist locally (append-only); if Redis data is lost, everyone signs in again. |
| Object storage | Uploads answer `503 storage_unavailable` and downloads `503 file_unavailable`; the upload can be retried. Screens that do not open files keep working.                  | Metadata and earlier versions; nothing is saved without its object.                                  |
| Email sink     | Nothing changes for the person acting. Deliveries retry and then wait in the failure queue for an administrator.                                                        | The business change and the in-app notification.                                                     |
| Resend         | Invitations save the account and answer `503 email_failed` (resend from Users); sign-in codes answer `503 email_failed`; reset requests show the usual message.         | The account change.                                                                                  |

`pnpm test:smoke` stops Redis, PostgreSQL and MinIO in turn and checks readiness, the Redis `503` and recovery.
