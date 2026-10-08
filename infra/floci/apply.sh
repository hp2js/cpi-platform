#!/usr/bin/env bash
# Applies infra/bootstrap, then infra/platform with the staging tfvars, to floci-az. Runs inside
# the compose `terraform` service. floci-az does not keep tags or every storage setting, so a
# second plan is not empty here; the scheduled drift workflow checks that against Azure.
set -euo pipefail
floci=floci-az:4577

until curl -sf "http://$floci/_floci/tls-cert" -o /usr/local/share/ca-certificates/floci-az.crt; do sleep 1; done
update-ca-certificates >/dev/null 2>&1

# azurerm calls Key Vault at <name>.vault.azure.net:443; send those names to floci-az. The
# vault name carries a hash of the resource group ID, as in infra/platform/main.tf.
suffix=$(printf '%s' "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/rg-cpi-staging" | sha1sum | cut -c1-6)
echo "127.0.0.1 kv-cpi-staging-$suffix.vault.azure.net kv-default.vault.azure.net" >>/etc/hosts
socat TCP-LISTEN:443,bind=127.0.0.1,fork,reuseaddr "TCP:$floci" &

work=$(mktemp -d)
run() {
  local stack=$1
  shift
  cp -r "/infra/$stack" "$work/$stack"
  rm -rf "$work/$stack/.terraform"
  cp /infra/floci/provider_override.tf "$work/$stack/"
  cd "$work/$stack"
  echo "--- $stack: init"
  terraform init -input=false -no-color >/dev/null
  echo "--- $stack: apply"
  terraform apply -input=false -no-color -auto-approve "$@"
}
# floci-az 0.13 has no Microsoft.Authorization (role assignments, locks), Log Analytics
# deleted-workspace API, ACR create polling or Azure Managed Redis (which the private endpoints
# reference), and reports every blob
# container as already existing; those resources (and the Container Apps that need the
# workspace) are checked by `terraform validate` and the IaC scanners only.
run bootstrap \
  -target=azurerm_storage_account.state \
  -target=azurerm_federated_identity_credential.github \
  -target=azurerm_user_assigned_identity.app
# Images are created by digest only; nothing runs them in floci-az.
digest=sha256:$(printf '0%.0s' {1..64})
run platform -var-file=/infra/platform/envs/staging.tfvars \
  -var acr_login_server=crcpilocal.azurecr.io \
  -var "api_image=crcpilocal.azurecr.io/cpi-api@$digest" \
  -var "web_image=crcpilocal.azurecr.io/cpi-web@$digest" \
  -target=azurerm_key_vault_secret.database_url \
  -target=azurerm_key_vault_secret.resend_api_key \
  -target=azurerm_postgresql_flexible_server_database.main \
  -target=azurerm_postgresql_flexible_server_configuration.main
echo "floci-az: the emulated resources of both stacks applied."
