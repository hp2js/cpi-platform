# Azure deployment

Terraform in `infra/` deploys the platform to Azure (South Africa North, the closest region to Kenya) as two environments: **staging** (demo mode; DAST runs here; releases are promoted from here) and **prod** (no demo accounts, zone-redundant, approval-gated). GitHub Actions deploys with OpenID Connect; no Azure credential is stored anywhere. The secure-PR gate and its scanners are in [security.md](security.md).

```
Internet ─► Container Apps ingress (TLS) ─► web: Caddy (SPA, CSP/HSTS) ─► api (internal only) ─┬─► PostgreSQL Flexible Server (VNet-integrated)
                                                                         release job (migrate) ─┼─► Azure Managed Redis      (private endpoint)
                                                                                                ├─► Blob Storage             (private endpoint, managed identity)
                                                                                                └─► Key Vault                (private endpoint, managed identity)
All logs ─► Log Analytics ─► alerts (action group), workbook dashboard, App Insights availability test
```

## Layout

| Path                                          | What                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `infra/bootstrap/`                            | Once per subscription, by an Owner: state storage, environment resource groups, the apps' managed identities, the GitHub OIDC identities and their roles, subscription activity log → audit workspace. |
| `infra/platform/`                             | One environment: network, Key Vault, PostgreSQL, Redis, Blob Storage, Container Apps (web, api, release job), monitoring.                                                                              |
| `infra/platform/envs/<env>.tfvars`            | Environment sizing; `<env>.backend.hcl` is its state container.                                                                                                                                        |
| `infra/floci/`                                | Local Azure emulator run (below).                                                                                                                                                                      |
| `scripts/release.sh`                          | Verify signatures → release job (migrations) → new revisions → readiness. Used by deploy and rollback.                                                                                                 |
| `scripts/vault-firewall.sh`                   | Opens the Key Vault firewall to the current runner for one run.                                                                                                                                        |
| `.github/workflows/deploy*.yml`               | CD (below).                                                                                                                                                                                            |
| `.github/workflows/rollback.yml`, `drift.yml` | Rollback and drift detection.                                                                                                                                                                          |

## Application changes this needed

- **File storage:** `STORAGE_BACKEND=azure` stores files in Blob Storage (`apps/api/src/storage/azure-blobs.ts`) behind the same `Objects` operations, error mapping and digest checks as S3/MinIO. In Azure the API signs in with its managed identity (`AZURE_CLIENT_ID`), so there is no storage key; `AZURE_STORAGE_CONNECTION_STRING` is for floci-az/Azurite only. Local and CI keep MinIO.
- **Release step:** `node dist/main.js --setup-only` migrates and seeds once, then exits. The Container Apps job runs it before replicas move to a new image; the API runs with `DB_AUTO_SETUP=false`.
- **Web proxy:** Caddy reads `API_UPSTREAM` (default `api:3001` for Compose) and sends the upstream's host, as Container Apps ingress routes by Host. It now also sends a Content-Security-Policy and HSTS.

## First-time setup

1. **Bootstrap** (Owner on the subscription, `az login`):

   ```sh
   cd infra/bootstrap
   printf 'terraform {\n  backend "local" {}\n}\n' > backend_override.tf   # first apply only
   terraform init && terraform apply
   rm backend_override.tf
   terraform init -migrate-state \
     -backend-config=resource_group_name=rg-cpi-shared -backend-config=container_name=tfstate-bootstrap \
     -backend-config=key=bootstrap.tfstate -backend-config=use_azuread_auth=true \
     -backend-config=storage_account_name="$(terraform output -json github_variables | jq -r .TFSTATE_ACCOUNT)"
   ```

2. **GitHub repository variables** (Settings → Secrets and variables → Variables; none is a secret) from `terraform output`:

   | Variable                                                        | From                                                                     |
   | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
   | `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `TFSTATE_ACCOUNT`   | `github_variables`                                                       |
   | `AZURE_CLIENT_ID_DEPLOY_STAGING`, `AZURE_CLIENT_ID_DEPLOY_PROD` | `github_client_ids["deploy-staging"]`, `["deploy-prod"]`                 |
   | `AZURE_CLIENT_ID_PLAN_PR`, `AZURE_CLIENT_ID_DRIFT`              | `github_client_ids["plan-pr"]`, `["drift"]`                              |
   | `ADMIN_EMAIL_PROD`                                              | The first production administrator (required: prod is not in demo mode). |
   | `ALERT_EMAILS_STAGING`, `ALERT_EMAILS_PROD`                     | Comma-separated addresses, e.g. `ops@example.org,lead@example.org`.      |

3. **GitHub environments:** `staging`, and `production` with required reviewers and deployment branches limited to `main`. The OIDC identities trust exactly these names.
4. **Branch ruleset on `main`:** require pull requests and the **Secure-PR gate** status check (see [security.md](security.md#making-it-required)).
5. **Push to `main`.** The first run pushes the images to GitHub Container Registry as private packages, so staging cannot pull them yet: an `hp2js` organization admin opens Packages → `cpi-platform/api` and `cpi-platform/web` → Package settings → **Change visibility → Public** (once), then re-runs the workflow. Afterwards, `az keyvault secret set --vault-name <kv> --name resend-api-key --value …` if account emails should leave the in-app sink.

### Setup pitfalls

What went wrong on the first deployment, and the fix:

| Symptom                                                                    | Cause                                                                           | Fix                                                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| "Plan staging" skipped on pull requests; drift and production sign-in fail | Variables created as **environment** variables of `staging`                     | Create them as **repository** variables; an environment variable also overrides a repository one inside that environment's jobs              |
| `AADSTS700213: No matching federated identity record`                      | The repository uses immutable OIDC subjects (`repo:<owner>@<id>/<repo>@<id>:…`) | `github_subject_prefix` in `infra/bootstrap` must equal `sub_claim_prefix` from `gh api repos/<owner>/<repo>/actions/oidc/customization/sub` |
| Environment jobs refused by Azure                                          | GitHub environment named other than `staging` / `production`                    | Rename it: the names are part of the trusted subject                                                                                         |
| Staging cannot pull images on the first deploy                             | GHCR packages start private                                                     | Make `cpi-platform/api` and `cpi-platform/web` public, then re-run the workflow                                                              |
| `Dependency review is not supported on this repository`                    | Dependency graph off                                                            | Settings → Advanced Security → enable Dependency graph and Dependabot alerts                                                                 |

## Deploying

`deploy.yml` on every push to `main`: build both images once → push to GitHub Container Registry (`ghcr.io/hp2js/cpi-platform/{api,web}`, public like the repository, pushed with the job's own `GITHUB_TOKEN`) → Trivy (fixable high/critical CVEs and secrets block) → Cosign keyless signature + attested CycloneDX SBOM → **staging** (Terraform apply, release job, new revisions, readiness) → **DAST** (ZAP baseline against staging; high-risk alerts block) → **production** after approval, with the _same digests_, re-verified against this workflow's signing identity before anything moves.

Terraform creates the apps with the first images and then ignores image changes; deployments move images (`az containerapp update`), so Terraform and releases never fight over them.

## Rollback

| What            | How                                                                                                                                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application     | Actions → **Rollback** → environment (optionally exact digests). Without digests it takes each app's newest earlier image from its revision history, verifies the signatures and switches; no migrations run. Migrations are forward-only, so each must stay compatible with the previous release (expand, then contract in a later release). |
| Infrastructure  | Revert the Terraform commit; `deploy.yml` applies it. The plan of every apply is kept 90 days as an artifact.                                                                                                                                                                                                                                 |
| Terraform state | The state containers keep every version (blob versioning, 30-day soft delete, change feed, delete lock). Restore a previous version of `platform.tfstate` from the portal or `az storage blob` with `--version-id`.                                                                                                                           |
| Database        | Point-in-time restore (7 days staging, 35 days prod, geo-redundant in prod) to a new server, then point `database-url` at it.                                                                                                                                                                                                                 |
| Files           | Blob versioning and 30-day soft delete.                                                                                                                                                                                                                                                                                                       |

## Drift

`drift.yml` runs daily: a read-only plan of each environment (no lock, no apply) against `main`. Any difference opens or updates a `Drift: <env>` issue with the plan; a clean run closes it. Fix drift by applying `main` (revert the out-of-band change) or by committing the change to Terraform.

## Secrets

- **No long-lived credentials.** GitHub Actions signs in with OIDC to user-assigned identities whose federated credentials trust one subject each (an environment, pull requests, or `main`). The apps use their own managed identity for Key Vault and Blob Storage, and pull public images without registry credentials.
- **Key Vault** (RBAC, purge protection, 90-day soft delete) holds `database-url`, `redis-url` and `resend-api-key`; Container Apps read them by reference, so values never appear in app configuration.
- **The database password never reaches Terraform state:** an ephemeral password is written to PostgreSQL and Key Vault through write-only arguments. Rotate it by increasing `database_password_version`. The Redis access key is a computed attribute of the cache and is in state; state is Entra-only, encrypted and audited.
- **Network:** Key Vault, Blob Storage and Redis are private endpoints only for the apps; PostgreSQL is VNet-integrated. Key Vault's public endpoint denies all traffic except the deploying runner's address for the duration of a run (`scripts/vault-firewall.sh`).

## Audit

| Evidence                                     | Where                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Who changed which Azure resource             | Subscription activity log → `log-cpi-audit` (365 days)                             |
| Secret reads, file reads/writes, DB sessions | Key Vault, blob and PostgreSQL diagnostic settings → environment workspace         |
| What Terraform planned and applied           | Plan artifacts per deployment; state versions and change feed                      |
| Who approved a production release            | GitHub environment deployment history                                              |
| What was deployed and how it was built       | Cosign signatures and SBOM attestations (Rekor transparency log), build provenance |
| Security findings per change                 | Code scanning alerts and SARIF artifacts ([security.md](security.md))              |

## Observability

The workbook **CPI <env> operations** (Azure Monitor → Workbooks) shows API requests by status class, p50/p95 latency, errors and dependency events, availability, revisions and restarts, and Key Vault access. Alerts go to the action group (`ALERT_EMAILS_<ENV>`):

| Alert              | Signal                                                                                  | Severity |
| ------------------ | --------------------------------------------------------------------------------------- | -------- |
| availability       | `/api/health/ready` failing from ≥ 2 of 3 locations (database, Redis, storage included) | 1        |
| dependency-failure | API logged `dependency.failure`                                                         | 1        |
| migration-failed   | Release job: migration, configuration or startup failure                                | 1        |
| api-5xx            | > 10 API 5xx responses in 5 minutes                                                     | 2        |
| api-restarts       | Replica restarts                                                                        | 2        |
| postgres-storage   | > 80 % storage                                                                          | 2        |
| vault-denied       | Key Vault 401/403                                                                       | 2        |
| postgres-cpu       | > 80 % CPU                                                                              | 3        |
| email-delivery     | Delivery worker or email send failing                                                   | 3        |

## Local: floci-az before Azure

[floci-az](https://github.com/floci-io/floci-az) emulates Azure Resource Manager locally. `pnpm infra:local` starts it and applies `infra/bootstrap` and then `infra/platform` with the **staging** tfvars, using the real stacks plus a provider override (`infra/floci/provider_override.tf`); `pnpm infra:local:down` removes it.

floci-az 0.13 implements resource groups, managed identities and federated credentials, storage accounts, VNets and subnets, private DNS, Key Vault and secrets (including write-only values), and PostgreSQL Flexible Server (a real PostgreSQL container, which is why the Docker socket is mounted): 34 resources across both stacks apply. It lacks role assignments and locks (`Microsoft.Authorization`), the Log Analytics deleted-workspace API (so the workspace and everything on it, including Container Apps), ACR create polling and Azure Managed Redis, and reports any blob container as existing; `infra/floci/apply.sh` targets around those, and they are covered by `terraform validate` and the IaC scanners instead. It also does not keep tags or every storage setting, so a second plan is not empty locally; the drift workflow checks idempotency against Azure.

The API's Blob backend runs against floci-az's Blob endpoint, with Azurite's published development account (`devstoreaccount1` and its well-known key, see the Azurite documentation):

```sh
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=<Azurite key>;BlobEndpoint=http://127.0.0.1:4577/devstoreaccount1;" \
  pnpm --filter @cpi/api exec vitest run src/storage/azure-blobs.int.test.ts
```

## Known limits and next steps

- **GitHub-hosted runners** need the state account and Key Vault reachable from the internet (Entra-only, and the vault only for the runner's address). Self-hosted runners in the VNet would allow private endpoints for both; the exceptions in `security/exceptions.json` name this.
- **The API connects as the PostgreSQL administrator.** A least-privilege application role needs a step inside the VNet (the release job is the natural place).
- **PostgreSQL 17** in Azure, 18 locally and in CI; move to 18 when Flexible Server offers it in the region.
- **Tracing:** logs and platform metrics are collected; OpenTelemetry traces to Application Insights need the SDK in the API.
- **Edge:** no WAF in front of the ingress; Front Door Premium with WAF if exposure requires it.
- **Images are public** in GitHub Container Registry, and pulls depend on GitHub's availability (running replicas are unaffected). For private images, use an Azure Container Registry with managed-identity pulls.
- **Real documents** stay off (`REAL_DOCUMENT_UPLOADS=false`) until malware scanning is in place ([storage.md](storage.md)).
