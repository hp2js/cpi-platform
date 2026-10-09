#!/usr/bin/env bash
# Moves an environment's apps to signed images, as deploy.yml and rollback.yml both do:
#   1. verifies each image's Cosign signature came from deploy.yml on main (keyless, Sigstore);
#   2. runs the release job (migrations, first seed) with the API image, unless --no-migrate;
#   3. points the API and web apps at the digests (one new revision each; the old one serves
#      until the new one is ready) and waits for the portal's readiness check.
# Migrations are forward-only, so a rollback keeps the schema: every migration must stay
# compatible with the previous release (add, then remove in a later release).
# Usage: scripts/release.sh <staging|prod> <api-image@sha256:…> <web-image@sha256:…> [--no-migrate]
set -euo pipefail
environment=${1:?staging or prod}
api=${2:?api image by digest}
web=${3:?web image by digest}
group=rg-cpi-$environment
name=cpi-$environment

for image in "$api" "$web"; do
  [[ $image == *@sha256:* ]] || { echo "Deploy by digest, not tag: $image" >&2; exit 1; }
  cosign verify "$image" --output text \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com \
    --certificate-identity "https://github.com/$GITHUB_REPOSITORY/.github/workflows/deploy.yml@refs/heads/main" >/dev/null
  echo "Signature verified: $image"
done

if [ "${4:-}" != --no-migrate ]; then
  az containerapp job update --resource-group "$group" --name "caj-$name-release" --image "$api" --output none
  execution=$(az containerapp job start --resource-group "$group" --name "caj-$name-release" --query name --output tsv)
  echo "Release job $execution started"
  for _ in $(seq 1 60); do
    status=$(az containerapp job execution show --resource-group "$group" --name "caj-$name-release" \
      --job-execution-name "$execution" --query properties.status --output tsv)
    case $status in
      Succeeded) echo "Release job succeeded" && break ;;
      Failed | Stopped | Degraded) echo "Release job $status; the apps still run the previous images" >&2 && exit 1 ;;
    esac
    sleep 10
  done
  [ "$status" = Succeeded ] || { echo "Release job timed out" >&2; exit 1; }
fi

az containerapp update --resource-group "$group" --name "ca-$name-api" --image "$api" --output none
az containerapp update --resource-group "$group" --name "ca-$name-web" --image "$web" --output none
portal="https://$(az containerapp show --resource-group "$group" --name "ca-$name-web" \
  --query properties.configuration.ingress.fqdn --output tsv)"
curl --fail --silent --show-error --retry 20 --retry-all-errors --retry-delay 6 "$portal/api/health/ready"
echo
echo "$environment is ready on $api and $web"
