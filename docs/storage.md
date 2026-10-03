# File storage

Uploaded evidence and foundation documents use a private S3-compatible bucket. PostgreSQL stores file metadata, checksum and object location; file bytes live in object storage. Both workflows use the same storage service and existing authenticated download endpoint. The browser never receives storage credentials or public object URLs. Downloads retain institution and reviewer access checks and use `Cache-Control: private, no-store`.

## Local setup

`pnpm docker:up` starts MinIO and provisions the private bucket before starting the API. For host-run applications, use `pnpm services:up` followed by `pnpm dev`. MinIO persists files in the `minio_data` volume. Ordinary shutdowns and rebuilds preserve them; `pnpm db:reset --confirm-local-data-loss` deletes them along with the database.

The S3 endpoint is http://localhost:19000 and the console is http://localhost:19001. Console credentials are `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` from `.env.example` or your local `.env`. The API uses a separate application user, restricted to listing the bucket and reading, writing and deleting objects under `evidence/`. Bootstrap runs idempotently and disables anonymous bucket access.

The Dockerfile builds checksum-pinned official MinIO and mc source releases because the tested prebuilt registry tags were unavailable. The first build takes longer than subsequent cached builds. Treat this local dependency separately from selecting and maintaining a hosted storage service.

## Configuration

| Variable                                   | Purpose                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `S3_ENDPOINT`                              | S3 API URL; host default `http://127.0.0.1:19000`, Compose uses `http://minio:9000` |
| `S3_REGION`                                | Signing region, default `us-east-1`                                                 |
| `S3_BUCKET`                                | Private bucket name, default `cpi-files`                                            |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Application credentials, never frontend variables                                   |
| `S3_FORCE_PATH_STYLE`                      | `true` for local MinIO; configure for your provider                                 |
| `S3_PREFIX`                                | Object namespace, default `evidence/`; optional subdirectories must remain below it |

For hosted S3-compatible storage, provision a private bucket and scoped application credentials, set the endpoint to the provider's HTTPS URL, and supply its signing region and addressing mode. The API does not create remote buckets. MinIO root credentials are only for local provisioning; do not give the API administrator credentials. The production Compose override remains a local image verification setup, not a hosted deployment configuration.

## Upload and recovery behavior

Files pass through the API's authorization, size limits (20 MiB per file, 100 MiB per report) and content checks (`checkUpload` in `packages/contracts/src/domain/uploads.ts`, shared with the development mock). PDF, PNG, JPEG, DOCX and XLSX are accepted, and each must be what its name says and inspectable:

| Type       | Refused when                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF        | No `%%EOF` (incomplete); `/Encrypt` (password-protected); `/JavaScript`, `/JS`, `/Launch` or `/EmbeddedFile` in an object dictionary (active content)                     |
| DOCX, XLSX | Not a readable ZIP with `[Content_Types].xml` and `word/document.xml` or `xl/workbook.xml`; encrypted entries; macros (`vbaProject.bin`), OLE objects or ActiveX controls |
| PNG, JPEG  | Missing header or end marker (incomplete)                                                                                                                                 |

These are structural checks, not antivirus scanning. Names inside compressed PDF object streams are not inspected.

**Real documents are gated.** Outside demo mode, uploads answer `403 uploads_not_approved` until `REAL_DOCUMENT_UPLOADS=true`. Set it only after malware scanning, quarantine of unscanned files, retention and a production review are in place; it records that decision and does not add a scanner. Demo mode accepts uploads because it holds synthetic files only.

Each object has a random key. Uploads send a transport checksum; metadata records SHA-256 and size, which are checked again on download. Database writes publish the reference only after the object upload succeeds. On transaction failure, the service removes the staged object after checking that it was not committed. Uncertain outcomes are retained for later cleanup rather than risking deletion of referenced files.

**Interrupted transfers.** An upload is one request of at most 20 MiB. If it is interrupted, nothing is attached (a staged object is removed or left for `storage:gc`), and the UI shows a retryable failure. Retrying is safe: the same file again returns the record already stored instead of a second version. There is no resumable upload protocol.

The UI distinguishes uploading from saving and displays retryable failures. Existing report deduplication and foundation retry deduplication prevent identical retries from creating another version. Historical versions retain their objects. A missing real object produces an explicit error; only designated synthetic demonstration records can use placeholder content.

Readiness requires the configured bucket as well as PostgreSQL and Redis. Liveness stays available during a storage outage. SDK operations have bounded timeouts; uploads are currently inside the existing serialized database write transaction, so storage latency also affects write throughput.

## Existing files and maintenance

Apply database migrations before running maintenance. Legacy PostgreSQL file bytes remain readable during the transition. Inspect first, then migrate:

```sh
pnpm storage:migrate          # count legacy files; no changes
pnpm storage:migrate --apply  # upload, read back and verify before clearing DB bytes
```

Migration is rerunnable and preserves file IDs, access controls and metadata. Run it with credentials for the same database and bucket as the API. Inside a development API container, use `docker compose exec api pnpm --filter @cpi/api storage:migrate --apply`.

Orphan cleanup operates only under the configured prefix. It considers objects older than 24 hours and rechecks database references under the write lock before deletion:

```sh
pnpm storage:gc           # inspect only
pnpm storage:gc --delete  # delete old unreferenced objects
```

Use a distinct prefix or bucket per environment and its matching database; never point cleanup at another environment's namespace. Database resets or reseeding can leave unreferenced objects until cleanup. Referenced historical versions are retained.

Back up and restore the database and bucket together. Restoring only the database cannot restore uploaded bytes. Decide retention and scanning requirements before using real records in a hosted deployment.

## Verification

With local services running, `pnpm test:integration` covers real MinIO uploads and downloads, private access, institution isolation, duplicate retries, rollback cleanup, missing objects, storage outages and legacy migration. `pnpm test:smoke` checks dependency outages and recovery, including MinIO. Frontend tests cover the existing file viewer and upload surfaces.
