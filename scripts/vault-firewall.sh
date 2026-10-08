#!/usr/bin/env bash
# Opens (or closes) an environment's Key Vault firewall to this runner's public address for one
# workflow run: Terraform writes and refreshes secrets over the public endpoint, which otherwise
# denies everything (apps use the private endpoint). On the run that creates the vault, `open`
# passes the address to Terraform instead (TF_VAR_runner_ips).
# Usage: scripts/vault-firewall.sh open|close <resource-group>
set -euo pipefail
action=${1:?open or close}
group=${2:?resource group}
address="$(curl -fsS --retry 3 https://api.ipify.org)/32"
vault=$(az keyvault list --resource-group "$group" --query '[0].name' --output tsv)
if [ -z "$vault" ]; then
  [ "$action" = open ] && echo "TF_VAR_runner_ips=[\"$address\"]" >>"$GITHUB_ENV"
  exit 0
fi
if [ "$action" = open ]; then
  az keyvault network-rule add --name "$vault" --resource-group "$group" --ip-address "$address" --output none
  # Firewall changes take a short while to reach every Key Vault front end.
  sleep 30
else
  az keyvault network-rule remove --name "$vault" --resource-group "$group" --ip-address "$address" --output none
fi
