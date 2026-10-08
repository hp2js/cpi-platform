# One-time, per-subscription foundation, applied by a person with Owner rights (see
# docs/deploy-azure.md): Terraform state, the environments' resource groups, the apps'
# identities and the GitHub OIDC identities. Everything else is in ../platform. Images live
# in GitHub Container Registry (public, like the repository), so there is no Azure registry.
terraform {
  required_version = "1.16.1"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "5.7.0"
    }
  }
  # Partial configuration: see bootstrap.backend.hcl. The first apply runs with local state and
  # then moves it here with `terraform init -migrate-state`.
  backend "azurerm" {}
}

provider "azurerm" {
  features {
    storage {
      # Shared keys are off; configure storage through the management plane only.
      data_plane_available = false
    }
  }
  storage_use_azuread = true
}

variable "location" {
  type    = string
  default = "southafricanorth"
}
variable "github_repository" {
  type    = string
  default = "hp2js/cpi-platform"
}
variable "environments" {
  type    = set(string)
  default = ["staging", "prod"]
}
variable "audit_retention_days" {
  type    = number
  default = 365
}

data "azurerm_subscription" "current" {}
data "azurerm_client_config" "current" {}

locals {
  suffix = substr(sha1(data.azurerm_subscription.current.id), 0, 6)
  tags   = { product = "cpi-platform", managed_by = "terraform", stack = "bootstrap" }
  oidc   = "https://token.actions.githubusercontent.com"
  repo   = "repo:${var.github_repository}"
  # GitHub environment names; prod deploys need a reviewer's approval in GitHub.
  github_environment = { staging = "staging", prod = "production" }
}

resource "azurerm_resource_group" "shared" {
  name     = "rg-cpi-shared"
  location = var.location
  tags     = local.tags
}

resource "azurerm_resource_group" "env" {
  for_each = var.environments
  name     = "rg-cpi-${each.key}"
  location = var.location
  tags     = merge(local.tags, { environment = each.key })
}

# --- Terraform state: Entra-only access, versioned, soft-deleted, locked against deletion ----
resource "azurerm_storage_account" "state" {
  name                              = "stcpitfstate${local.suffix}"
  resource_group_name               = azurerm_resource_group.shared.name
  location                          = var.location
  account_tier                      = "Standard"
  account_replication_type          = "GZRS"
  min_tls_version                   = "TLS1_2"
  shared_access_key_enabled         = false
  default_to_oauth_authentication   = true
  allow_nested_items_to_be_public   = false
  infrastructure_encryption_enabled = true
  cross_tenant_replication_enabled  = false
  # ponytail: reachable from GitHub-hosted runners with Entra auth only; self-hosted runners
  # in a VNet would allow a private endpoint and public_network_access_enabled = false.
  public_network_access_enabled = true
  blob_properties {
    versioning_enabled  = true
    change_feed_enabled = true
    delete_retention_policy {
      days = 30
    }
    container_delete_retention_policy {
      days = 30
    }
  }
  tags = local.tags
  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "state" {
  for_each           = setunion(var.environments, ["bootstrap"])
  name               = "tfstate-${each.key}"
  storage_account_id = azurerm_storage_account.state.id
}

# Whoever applies bootstrap reads and writes its state (Owner has no blob data access).
resource "azurerm_role_assignment" "operator_state" {
  scope                = azurerm_storage_account.state.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_management_lock" "state" {
  name       = "protect-terraform-state"
  scope      = azurerm_storage_account.state.id
  lock_level = "CanNotDelete"
  notes      = "Terraform state; every version is kept for audit and rollback."
}

# --- Audit: subscription activity log (who changed what, from where) ------------------------
resource "azurerm_log_analytics_workspace" "audit" {
  name                = "log-cpi-audit"
  resource_group_name = azurerm_resource_group.shared.name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = var.audit_retention_days
  tags                = local.tags
}

resource "azurerm_monitor_diagnostic_setting" "activity" {
  name                       = "activity-to-audit"
  target_resource_id         = data.azurerm_subscription.current.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.audit.id
  dynamic "enabled_log" {
    for_each = ["Administrative", "Security", "Policy", "Alert"]
    content {
      category = enabled_log.value
    }
  }
}

resource "azurerm_monitor_diagnostic_setting" "state" {
  name                       = "state-access-to-audit"
  target_resource_id         = "${azurerm_storage_account.state.id}/blobServices/default"
  log_analytics_workspace_id = azurerm_log_analytics_workspace.audit.id
  enabled_log {
    category_group = "audit"
  }
}

# --- GitHub Actions identities: OIDC federation, no client secrets --------------------------
locals {
  identities = merge(
    {
      for env in var.environments : "deploy-${env}" => {
        subject = "${local.repo}:environment:${local.github_environment[env]}"
        env     = env
        deploy  = true
        roles   = []
      }
    },
    {
      # Same-repo pull requests plan staging without refreshing (no secret reads); forks never
      # receive an OIDC token.
      plan-pr = {
        subject = "${local.repo}:pull_request", env = "staging", deploy = false
        roles   = ["Reader"]
      }
      # Scheduled drift detection on main refreshes every environment, so it reads secrets
      # and opens the Key Vault firewall to its runner for the run.
      drift = {
        subject = "${local.repo}:ref:refs/heads/main", env = null, deploy = false
        roles   = ["Reader", "Key Vault Secrets User", "Key Vault Contributor"]
      }
    },
  )
  reader_scopes = merge([
    for name, identity in local.identities : {
      for env in(identity.env == null ? var.environments : [identity.env]) :
      "${name}/${env}" => { identity = name, env = env, roles = identity.roles }
    } if !identity.deploy
  ]...)
}

resource "azurerm_user_assigned_identity" "github" {
  for_each            = local.identities
  name                = "id-github-${each.key}"
  resource_group_name = azurerm_resource_group.shared.name
  location            = var.location
  tags                = local.tags
}

resource "azurerm_federated_identity_credential" "github" {
  for_each                  = local.identities
  name                      = "github-${each.key}"
  user_assigned_identity_id = azurerm_user_assigned_identity.github[each.key].id
  audience                  = ["api://AzureADTokenExchange"]
  issuer                    = local.oidc
  subject                   = each.value.subject
}

# Deployers manage their own environment's resource group, role assignments in it, and the
# Key Vault secrets Terraform writes (granted here so they exist before the vault does).
# ponytail: RBAC Administrator is unconstrained within the group; add an ABAC condition
# limiting assignable roles if more teams share the subscription.
resource "azurerm_role_assignment" "deploy" {
  for_each = {
    for pair in setproduct(var.environments, ["Contributor", "Role Based Access Control Administrator", "Key Vault Secrets Officer"]) :
    "${pair[0]}/${pair[1]}" => { env = pair[0], role = pair[1] }
  }
  scope                = azurerm_resource_group.env[each.value.env].id
  role_definition_name = each.value.role
  principal_id         = azurerm_user_assigned_identity.github["deploy-${each.value.env}"].principal_id
}

resource "azurerm_role_assignment" "deploy_state" {
  for_each             = var.environments
  scope                = azurerm_storage_container.state[each.key].id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.github["deploy-${each.key}"].principal_id
}

# The identity each environment's apps run as. It lives in the environment's group, created
# here so it exists before the platform stack grants it Key Vault and storage access.
resource "azurerm_user_assigned_identity" "app" {
  for_each            = var.environments
  name                = "id-cpi-${each.key}"
  resource_group_name = azurerm_resource_group.env[each.key].name
  location            = var.location
  tags                = merge(local.tags, { environment = each.key })
}

resource "azurerm_role_assignment" "reader" {
  for_each = merge([
    for key, scope in local.reader_scopes : {
      for role in scope.roles : "${key}/${role}" => merge(scope, { role = role })
    }
  ]...)
  scope                = azurerm_resource_group.env[each.value.env].id
  role_definition_name = each.value.role
  principal_id         = azurerm_user_assigned_identity.github[each.value.identity].principal_id
}

resource "azurerm_role_assignment" "reader_state" {
  for_each             = local.reader_scopes
  scope                = azurerm_storage_container.state[each.value.env].id
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.github[each.value.identity].principal_id
}

# --- Values for GitHub (variables, not secrets: none of these grant access by themselves) ---
output "github_variables" {
  value = {
    AZURE_TENANT_ID       = data.azurerm_client_config.current.tenant_id
    AZURE_SUBSCRIPTION_ID = data.azurerm_client_config.current.subscription_id
    TFSTATE_ACCOUNT       = azurerm_storage_account.state.name
    TFSTATE_RG            = azurerm_resource_group.shared.name
  }
}
output "github_client_ids" {
  description = "AZURE_CLIENT_ID per workflow identity."
  value       = { for name, identity in azurerm_user_assigned_identity.github : name => identity.client_id }
}
