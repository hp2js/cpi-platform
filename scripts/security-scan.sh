#!/usr/bin/env bash
# The secure-PR gate's scanners, in digest-pinned containers, so a local run and CI produce the
# same SARIF (security/reports/, git-ignored). Scanners never fail on findings; the merge
# policy is scripts/sarif-gate.mjs. CI runs one tool per job; `all` runs them in turn.
#
#   scripts/security-scan.sh all                 SAST, SCA, secrets, IaC (no images, no DAST)
#   scripts/security-scan.sh trivy-image <ref>   container image: vulnerabilities, secrets, SBOM
#   scripts/security-scan.sh zap <url>           DAST baseline (passive) against a running stack
#   node scripts/sarif-gate.mjs security/reports/*.sarif
#
# GITLEAKS_LOG_OPTS limits the history scanned (CI passes the pull request's commit range).
set -euo pipefail
cd "$(dirname "$0")/.."
out=security/reports
mkdir -p "$out" .cache/trivy

SEMGREP=semgrep/semgrep:1.178.0@sha256:32e459968daabe7ab86968184a29109b9564aa00392401156f9788452b42786b
GITLEAKS=zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f
OSV=ghcr.io/google/osv-scanner:v2.6.0@sha256:afd838850ac1a0fcc15ff4a041dc9ba11123c3f0d2666217a5f0fcf9222b55fa
PYTHON=python:3.13.9-slim@sha256:326df678c20c78d465db501563f3492d17c42a4afe33a1f2bf5406a1d56b0e86
CHECKOV=bridgecrew/checkov:3.3.19@sha256:d3e96adafdb315ca82e792ca8708c01adae85292800fb064c8b309b3d0cb7b80
TFLINT=ghcr.io/terraform-linters/tflint:v0.64.0@sha256:1c595f42d794c32c45a6ea8b58655fd66433d4ca3b1bc631c574a48d120bd19f
TRIVY=aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969
ZAP=ghcr.io/zaproxy/zaproxy:2.17.0@sha256:781a2bdaea47324e7bab583e2263f21d257b0aee61ed51521a5be45f5f5081ef

# The checkout is mounted read-only, as the caller's user, with reports written to $out.
run() {
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$PWD:/src:ro" -v "$PWD/$out:/src/$out" -w /src "$@"
}

semgrep() {
  run "$SEMGREP" semgrep scan --metrics=off --quiet \
    --config=p/default --config=p/owasp-top-ten --config=p/typescript --config=p/react \
    --sarif-output="$out/semgrep.sarif"
}
gitleaks() {
  run -v "$PWD/.git:/src/.git:ro" "$GITLEAKS" git --redact --no-banner \
    --log-opts="${GITLEAKS_LOG_OPTS:---all}" \
    --report-format=sarif --report-path="$out/gitleaks.sarif" --exit-code=0 .
}
# Proves the gate itself: a throwaway repository gets a synthetic AWS-style key (generated now,
# so this repository never holds one) and the gate must block it; the commit is then rewritten
# without the key, as a real leak is remediated, and the gate must pass. Evidence SARIF goes to
# $out/regression/, outside the gate's own glob.
gitleaks-regression() {
  local repo key
  repo=$(mktemp -d)
  mkdir -p "$out/regression"
  git -C "$repo" init --quiet
  git -C "$repo" config user.email gate@example.invalid
  git -C "$repo" config user.name "Secure-PR gate"
  # head closes the pipe once it has 16 characters, so tr's SIGPIPE is expected.
  key="AKIA$(LC_ALL=C tr -dc 'A-Z2-7' </dev/urandom | head -c 16 || true)"
  printf 'region = "af-south-1"\naws_access_key_id = "%s"\n' "$key" >"$repo/settings.toml"
  git -C "$repo" add . && git -C "$repo" commit --quiet -m "Add settings"
  scan_regression "$repo" leaked
  if node scripts/sarif-gate.mjs "$out/regression/gitleaks-leaked.sarif" >/dev/null; then
    echo "FAIL: the gate passed a committed secret" >&2
    return 1
  fi
  echo "1/2 the gate blocks a committed secret"
  printf 'region = "af-south-1"\n' >"$repo/settings.toml"
  git -C "$repo" commit --quiet --all --amend -m "Add settings"
  git -C "$repo" reflog expire --expire=now --all && git -C "$repo" gc --quiet --prune=now
  scan_regression "$repo" fixed
  node scripts/sarif-gate.mjs "$out/regression/gitleaks-fixed.sarif" >/dev/null
  echo "2/2 the gate passes once the secret is removed from history"
  rm -rf "$repo"
}
scan_regression() {
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$1:/repo:ro" \
    -v "$PWD/$out/regression:/out" "$GITLEAKS" git --redact --no-banner --log-level=warn \
    --report-format=sarif --report-path="/out/gitleaks-$2.sarif" --exit-code=0 /repo
}
osv() {
  # Exit 1 means vulnerabilities were found; the gate decides what blocks.
  run "$OSV" scan source --recursive --format=sarif --output-file="$out/osv.sarif" . || [ $? -eq 1 ]
}
bandit() {
  # Python SAST; the repository has no Python today, so this proves the job stays wired.
  run "$PYTHON" sh -c "pip install --quiet --disable-pip-version-check --target /tmp/bandit 'bandit[sarif]==1.9.4' \
    && PYTHONPATH=/tmp/bandit python -m bandit --recursive . --exclude ./node_modules,./.git \
       --format sarif --output $out/bandit.sarif --exit-zero --quiet"
}
eslint() {
  ESLINT_SECURITY=1 pnpm exec eslint . --format @microsoft/eslint-formatter-sarif --output-file "$out/eslint.sarif" || true
  [ -s "$out/eslint.sarif" ]
}
checkov() {
  run "$CHECKOV" --quiet --compact --soft-fail \
    --directory infra --directory docker --directory .github \
    --framework terraform dockerfile github_actions \
    --output sarif --output-file-path "$out"
  mv "$out/results_sarif.sarif" "$out/checkov.sarif"
}
tflint() {
  # Rulesets are downloaded by --init, so this one runs with a writable plugin directory.
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e GITHUB_TOKEN \
    -v "$PWD/infra:/infra:ro" -v "$PWD/$out:/out" -w /infra --entrypoint sh "$TFLINT" -c \
    'tflint --init --config /infra/.tflint.hcl >/dev/null && tflint --recursive --config /infra/.tflint.hcl --format sarif --force > /out/tflint.sarif'
}
trivy_run() {
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$PWD:/src:ro" -v "$PWD/$out:/src/$out" -v "$PWD/.cache/trivy:/cache" -w /src "$@"
}
trivy-config() {
  trivy_run "$TRIVY" config --cache-dir /cache --quiet --skip-dirs .kilo,node_modules --format sarif --output "$out/trivy-config.sarif" .
}
trivy-image() {
  local image=${1:?image reference} name source access=()
  name=$(basename "${image%%[@:]*}")
  # Registry images (host.domain/…) are pulled with the caller's registry login; local images
  # are handed over as a tarball, so the scanner needs no Docker socket.
  if [[ ${image%%/*} == *.* ]]; then
    access=(-v "${DOCKER_CONFIG:-$HOME/.docker}:/tmp/.docker:ro")
    source=("$image")
  else
    docker save "$image" --output ".cache/trivy/$name.tar"
    source=(--input "/cache/$name.tar")
  fi
  # Unfixed CVEs are left out: the gate blocks what an upgrade can fix.
  trivy_run ${access[@]+"${access[@]}"} "$TRIVY" image --cache-dir /cache --quiet --ignore-unfixed \
    --scanners vuln,secret --format sarif --output "$out/trivy-image-$name.sarif" "${source[@]}"
  trivy_run ${access[@]+"${access[@]}"} "$TRIVY" image --cache-dir /cache --quiet \
    --format cyclonedx --output "$out/sbom-$name.cdx.json" "${source[@]}"
  rm -f ".cache/trivy/$name.tar"
}
zap() {
  local target=${1:?url of a running stack, e.g. http://host.docker.internal:5180}
  # Passive baseline: spiders and inspects responses, sends no attacks. ZAP's own exit code is
  # ignored; the SARIF report goes to the gate like every other scanner.
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp --add-host=host.docker.internal:host-gateway \
    -e "ZAP_TARGET=${target%/}" -v "$PWD/security/zap:/zap/config:ro" -v "$PWD/$out:/zap/wrk" "$ZAP" \
    zap.sh -cmd -dir /tmp/zap -autorun /zap/config/baseline.yaml
  # ZAP appends the template's extension.
  mv "$out/zap.sarif.json" "$out/zap.sarif"
}

tool=${1:?tool: all, semgrep, gitleaks, gitleaks-regression, osv, bandit, eslint, checkov, tflint, trivy-config, trivy-image, zap}
shift
if [ "$tool" = all ]; then
  for each in semgrep gitleaks gitleaks-regression osv bandit eslint checkov tflint trivy-config; do
    echo "--- $each" && "$each"
  done
else
  "$tool" "$@"
fi
