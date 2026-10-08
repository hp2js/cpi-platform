# Security gate

Every pull request runs `.github/workflows/security.yml`. Each scanner writes **SARIF 2.1.0** (the OASIS standard, so results are portable evidence), which goes to GitHub code scanning and is kept 90 days as a workflow artifact. One policy, `scripts/sarif-gate.mjs`, decides what blocks a merge, so every tool is judged the same way.

| Category  | Tool (pinned)                                                     | SARIF category                      | Runs on                               |
| --------- | ----------------------------------------------------------------- | ----------------------------------- | ------------------------------------- |
| SAST      | Semgrep 1.178.0 (default, OWASP Top 10, TypeScript, React)        | `semgrep`                           | PRs, `main`, weekly                   |
| SAST      | ESLint + eslint-plugin-security 4.2.0                             | `eslint`                            | PRs, `main`, weekly                   |
| SAST      | Bandit 1.9.4 (Python; none in the repo today)                     | `bandit`                            | PRs, `main`, weekly                   |
| SCA       | OSV-Scanner 2.6.0 (`pnpm-lock.yaml`)                              | `osv`                               | PRs, `main`, weekly                   |
| SCA       | Dependency review (Dependabot advisories, high+)                  | (check)                             | PRs                                   |
| SCA       | Dependabot alerts and update PRs, 7-day cooldown                  | (alerts)                            | Continuous                            |
| Secrets   | Gitleaks 8.30.1 (PR: every commit in the PR; `main`: all history) | `gitleaks`                          | PRs, `main`, weekly                   |
| IaC       | Checkov 3.3.19, TFLint 0.64 + azurerm ruleset, Trivy config 0.74  | `checkov`, `tflint`, `trivy-config` | PRs, `main`, weekly                   |
| IaC       | `terraform fmt`/`validate`; staging plan via OIDC                 | (check)                             | PRs                                   |
| Container | Trivy image (vulnerabilities, secrets) + CycloneDX SBOM           | `trivy-image-*`, `release-image-*`  | PRs (scan); CD (scan, sign, attest)   |
| DAST      | ZAP 2.17.0 baseline (passive)                                     | `zap-staging`                       | CD, against staging before production |

## Merge policy

A result **blocks** when it is a secret (any Gitleaks result), has SARIF level `error`, or has a `security-severity` of 7.0 or more (high/critical). Everything else is reported for triage. A blocking result can be accepted only by an entry in `security/exceptions.json` with the tool, rule, path, reason, owner and an **expiry date**; an expired exception blocks again. Exceptions change by pull request, so every acceptance is reviewed and in git history.

The **Secure-PR gate** job fails if any scanner job failed (a crashed scanner is not a pass) or the policy finds a blocking result, and writes the table to the run summary. Its artifact `secure-pr-gate-evidence` holds every SARIF file, the gate report and the exceptions in force.

### Making it required

Settings → Rules → Rulesets → new branch ruleset for `main`: require a pull request, require status checks → **Secure-PR gate** (from GitHub Actions), block force pushes. With the gate as the only required check, adding or removing a scanner never needs a settings change.

## Running it locally

```sh
pnpm security:scan                                   # SAST, SCA, secrets, IaC, Gitleaks regression → gate
scripts/security-scan.sh trivy-image hp2js-cpi-api:prod   # after pnpm docker:prod
scripts/security-scan.sh zap http://host.docker.internal:5180
node scripts/sarif-gate.mjs security/reports/*.sarif
```

Each scanner runs in a digest-pinned container with the checkout mounted read-only, so a local run and CI produce the same SARIF.

## Proving the gate: the Gitleaks regression

`scripts/security-scan.sh gitleaks-regression` (job **gitleaks regression** on every run) builds a throwaway repository, commits a synthetic AWS-style key generated at run time (this repository never contains one), and requires the gate to **fail**. It then rewrites the commit without the key, as a real leak is remediated, and requires the gate to **pass**. Both SARIF files are kept as evidence (`gitleaks-regression` artifact, key redacted). If either half stops holding, the job, and therefore the gate, fails.

To show the same thing on a real pull request: commit a fake key on a branch and open a PR (the gate fails on Gitleaks), then remove it from the branch's history (`git rebase -i`, drop or edit the commit, force-push) and the gate passes. Deleting the key in a later commit is not enough: the PR is scanned commit by commit, matching how a leaked key stays exposed in history.

## Supply chain

- Actions pinned by commit SHA, images by digest, packages and tools by exact version; Terraform providers locked for Linux and macOS.
- pnpm resolves only versions at least 7 days old (`minimumReleaseAge`, with `@types/*` excepted), refuses provenance downgrades and exotic sub-dependencies; Dependabot waits 7 days too.
- Release images: Trivy-gated, signed keylessly with Cosign (Sigstore, bound to `deploy.yml` on `main`), CycloneDX SBOM attested, build provenance attached; signatures are verified again before staging, production and any rollback.

## Findings (first run, 2026-10-08)

The first full run produced **332 findings** (256 static, 67 container, 9 DAST), **66 blocking**; the new workflows added 5 more when they were first scanned. All blocking findings are now fixed or accepted with an expiring exception; the gate passes.

| Area          | Blocking at first run                                                                 | Resolution                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCA           | 5 high CVEs (undici, source-map-js, basic-ftp, shell-quote) in dev/build dependencies | Fixed: `pnpm-workspace.yaml` overrides; 15 OSV results → 2 medium.                                                                                                                                                                                                           |
| Container     | 22 fixable high CVEs: 17 in Caddy (Go 1.26.3, x/net, grpc), 5 in Debian OpenSSL/PCRE2 | Fixed: Caddy 2.11.7, refreshed `node:24.21.0-trixie-slim` digest; 57 Trivy results → 1 non-blocking.                                                                                                                                                                         |
| DAST          | Content-Security-Policy missing (medium; reported, not blocking)                      | Fixed: CSP in `docker/Caddyfile` (scripts `'self'` only), HSTS on static responses; verified with the production e2e and file-preview specs.                                                                                                                                 |
| IaC           | 33 Checkov, 3 Trivy, 2 Semgrep on the new Terraform and Dockerfiles                   | Fixed: NSGs on all subnets, Premium registry (zone-redundant, retention, data endpoints), GZRS state, Key Vault firewall default-deny. Accepted (expiring 2027-04-08): GitHub-hosted runner reachability, Cosign instead of Content Trust, MS-managed keys, false positives. |
| CI/CD (later) | 4 Semgrep shell-injection patterns, 1 Checkov (rollback inputs) in the new workflows  | Fixed: inputs passed as environment variables. Accepted: rollback inputs, as every image must carry this workflow's signature.                                                                                                                                               |
| SAST          | 1 Semgrep insecure request (`scripts/smoke.mjs`)                                      | Suppressed inline: the local stack is plain HTTP.                                                                                                                                                                                                                            |

Non-blocking backlog (reported each run, no action required to merge):

| Tool         | Count | Triage                                                                                                                                                                                                                                                        |
| ------------ | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint       |   160 | 136 `detect-object-injection` (typed record lookups) and 12 non-literal file names in scripts/tests; the 1 timing-attack hit compares file SHA-256s for de-duplication, and the 6 unsafe-regex hits are anchored with no nested quantifiers. False positives. |
| Trivy config |    13 | Dockerfile `HEALTHCHECK` notes (probes are in the orchestrator), log-retention and key-expiry notes covered above.                                                                                                                                            |
| Semgrep      |    10 | Secret-expiry, queue logging, regex in tests, `.npmrc` release age (set in `pnpm-workspace.yaml` instead).                                                                                                                                                    |
| TFLint       |     8 | `prevent_destroy` suggestions on identities, DNS and network (recreatable without data loss).                                                                                                                                                                 |
| ZAP          |    10 | CSP allows inline styles (needed by the sandboxed document preview); informational "modern web application".                                                                                                                                                  |
| OSV          |     2 | Medium: `sprintf-js` and `esbuild` 0.18 inside dev tooling.                                                                                                                                                                                                   |
