# Data tier, network and secrets for one environment. The resource group and the apps' identity
# come from ../bootstrap.
data "azurerm_client_config" "current" {}

data "azurerm_resource_group" "env" {
  name = "rg-cpi-${var.environment}"
}

data "azurerm_user_assigned_identity" "app" {
  name                = "id-cpi-${var.environment}"
  resource_group_name = data.azurerm_resource_group.env.name
}

locals {
  name     = "cpi-${var.environment}"
  rg       = data.azurerm_resource_group.env.name
  location = data.azurerm_resource_group.env.location
  # Globally unique names (storage, vault, database, cache) need a stable suffix.
  suffix = substr(sha1(data.azurerm_resource_group.env.id), 0, 6)
  tags   = { product = "cpi-platform", environment = var.environment, managed_by = "terraform" }
  # Demo controls only ever run against a database whose name ends in _demo (HP2-42).
  database_name   = var.demo_mode ? "cpi_demo" : "cpi"
  files_container = "cpi-files"
}

# --- Network: apps, database and private endpoints each get a subnet ------------------------
resource "azurerm_virtual_network" "main" {
  name                = "vnet-${local.name}"
  resource_group_name = local.rg
  location            = local.location
  address_space       = [var.address_space]
  tags                = local.tags
}

resource "azurerm_subnet" "apps" {
  name                 = "snet-apps"
  resource_group_name  = local.rg
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [cidrsubnet(var.address_space, 7, 0)]
  delegation {
    name = "container-apps"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "postgres" {
  name                 = "snet-postgres"
  resource_group_name  = local.rg
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [cidrsubnet(var.address_space, 8, 2)]
  delegation {
    name = "postgres"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "endpoints" {
  name                              = "snet-endpoints"
  resource_group_name               = local.rg
  virtual_network_name              = azurerm_virtual_network.main.name
  address_prefixes                  = [cidrsubnet(var.address_space, 8, 3)]
  private_endpoint_network_policies = "Enabled"
}

# Default rules only (VNet and load balancer in, nothing from the internet), attached so flow
# logs and future rules have a place to go.
resource "azurerm_network_security_group" "main" {
  name                = "nsg-${local.name}"
  resource_group_name = local.rg
  location            = local.location
  tags                = local.tags
}

resource "azurerm_subnet_network_security_group_association" "main" {
  for_each = {
    apps      = azurerm_subnet.apps.id
    postgres  = azurerm_subnet.postgres.id
    endpoints = azurerm_subnet.endpoints.id
  }
  subnet_id                 = each.value
  network_security_group_id = azurerm_network_security_group.main.id
}

resource "azurerm_private_dns_zone" "zone" {
  for_each = {
    postgres = "${local.name}.private.postgres.database.azure.com"
    blob     = "privatelink.blob.core.windows.net"
    vault    = "privatelink.vaultcore.azure.net"
    redis    = "privatelink.redis.azure.net"
  }
  name                = each.value
  resource_group_name = local.rg
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "zone" {
  for_each              = azurerm_private_dns_zone.zone
  name                  = "link-${each.key}"
  resource_group_name   = local.rg
  private_dns_zone_name = each.value.name
  virtual_network_id    = azurerm_virtual_network.main.id
  tags                  = local.tags
}

locals {
  private_endpoints = {
    blob  = { id = azurerm_storage_account.files.id, subresource = "blob" }
    vault = { id = azurerm_key_vault.main.id, subresource = "vault" }
    redis = { id = azurerm_managed_redis.main.id, subresource = "redisEnterprise" }
  }
}

resource "azurerm_private_endpoint" "main" {
  for_each            = local.private_endpoints
  name                = "pe-${local.name}-${each.key}"
  resource_group_name = local.rg
  location            = local.location
  subnet_id           = azurerm_subnet.endpoints.id
  private_service_connection {
    name                           = "psc-${each.key}"
    private_connection_resource_id = each.value.id
    subresource_names              = [each.value.subresource]
    is_manual_connection           = false
  }
  private_dns_zone_group {
    name                 = each.key
    private_dns_zone_ids = [azurerm_private_dns_zone.zone[each.key].id]
  }
  tags = local.tags
}

# --- Secrets: Key Vault with RBAC; apps read their secrets through the managed identity ------
resource "azurerm_key_vault" "main" {
  name                       = "kv-${local.name}-${local.suffix}"
  resource_group_name        = local.rg
  location                   = local.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  purge_protection_enabled   = true
  soft_delete_retention_days = 90
  # Apps use the private endpoint. The public endpoint denies everything except the runner of
  # an ongoing deployment: scripts/vault-firewall.sh adds its address for the run and removes
  # it after, so rules change outside Terraform. ponytail: self-hosted runners in the VNet
  # would let public_network_access_enabled be false.
  public_network_access_enabled = true
  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
    ip_rules       = var.runner_ips
  }
  tags = local.tags
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [network_acls[0].ip_rules]
  }
}

resource "azurerm_role_assignment" "app_secrets" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = data.azurerm_user_assigned_identity.app.principal_id
}

# A new password is generated each run but only sent when database_password_version changes;
# it goes to PostgreSQL and Key Vault through write-only arguments, so state never holds it.
ephemeral "random_password" "database" {
  length  = 40
  special = false
}

resource "azurerm_key_vault_secret" "database_url" {
  name             = "database-url"
  key_vault_id     = azurerm_key_vault.main.id
  content_type     = "text/plain"
  value_wo         = "postgresql://${azurerm_postgresql_flexible_server.main.administrator_login}:${ephemeral.random_password.database.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${local.database_name}?sslmode=verify-full"
  value_wo_version = var.database_password_version
}

# The cache's access key is a computed attribute of the cache, so it is in state regardless.
resource "azurerm_key_vault_secret" "redis_url" {
  name         = "redis-url"
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  value        = "rediss://:${azurerm_managed_redis.main.default_database[0].primary_access_key}@${azurerm_managed_redis.main.hostname}:10000"
}

# Set by an operator (`az keyvault secret set --name resend-api-key`), never by Terraform;
# empty keeps account emails in the in-app sink.
resource "azurerm_key_vault_secret" "resend_api_key" {
  name         = "resend-api-key"
  key_vault_id = azurerm_key_vault.main.id
  content_type = "text/plain"
  value        = "unset"
  lifecycle {
    ignore_changes = [value]
  }
}

# --- PostgreSQL: VNet-only, TLS required, backups sized by environment ----------------------
resource "azurerm_postgresql_flexible_server" "main" {
  name                              = "psql-${local.name}-${local.suffix}"
  resource_group_name               = local.rg
  location                          = local.location
  version                           = "17"
  sku_name                          = var.postgres_sku
  storage_mb                        = 32768
  auto_grow_enabled                 = true
  delegated_subnet_id               = azurerm_subnet.postgres.id
  private_dns_zone_id               = azurerm_private_dns_zone.zone["postgres"].id
  public_network_access_enabled     = false
  administrator_login               = "cpi_admin"
  administrator_password_wo         = ephemeral.random_password.database.result
  administrator_password_wo_version = var.database_password_version
  backup_retention_days             = var.high_availability ? 35 : 7
  geo_redundant_backup_enabled      = var.high_availability
  zone                              = "1"
  dynamic "high_availability" {
    for_each = var.high_availability ? [1] : []
    content {
      mode = "ZoneRedundant"
    }
  }
  maintenance_window {
    day_of_week  = 0
    start_hour   = 2
    start_minute = 0
  }
  tags       = local.tags
  depends_on = [azurerm_private_dns_zone_virtual_network_link.zone]
  lifecycle {
    prevent_destroy = true
    # Azure moves the primary between zones on failover.
    ignore_changes = [zone, high_availability[0].standby_availability_zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = local.database_name
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_postgresql_flexible_server_configuration" "main" {
  for_each = {
    require_secure_transport     = "on"
    log_connections              = "on"
    log_disconnections           = "on"
    log_checkpoints              = "on"
    "connection_throttle.enable" = "on"
  }
  name      = each.key
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = each.value
}

# --- Redis (Azure Managed Redis): sessions and rate limits; never evicts ---------------------
resource "azurerm_managed_redis" "main" {
  name                      = "redis-${local.name}-${local.suffix}"
  resource_group_name       = local.rg
  location                  = local.location
  sku_name                  = var.redis_sku
  high_availability_enabled = var.high_availability
  public_network_access     = "Disabled"
  default_database {
    access_keys_authentication_enabled = true
    client_protocol                    = "Encrypted"
    # One endpoint with every key on one shard, so MULTI and KEYS behave as on a single node.
    clustering_policy = "NoCluster"
    eviction_policy   = "NoEviction"
  }
  tags = local.tags
}

# --- File storage: private, Entra-only, versioned and soft-deleted --------------------------
resource "azurerm_storage_account" "files" {
  name                              = "stcpi${var.environment}${local.suffix}"
  resource_group_name               = local.rg
  location                          = local.location
  account_kind                      = "StorageV2"
  account_tier                      = "Standard"
  account_replication_type          = var.high_availability ? "ZRS" : "LRS"
  min_tls_version                   = "TLS1_2"
  https_traffic_only_enabled        = true
  shared_access_key_enabled         = false
  default_to_oauth_authentication   = true
  allow_nested_items_to_be_public   = false
  infrastructure_encryption_enabled = true
  cross_tenant_replication_enabled  = false
  local_user_enabled                = false
  public_network_access_enabled     = false
  network_rules {
    default_action = "Deny"
    bypass         = ["AzureServices"]
  }
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

resource "azurerm_storage_container" "files" {
  name                  = local.files_container
  storage_account_id    = azurerm_storage_account.files.id
  container_access_type = "private"
}

resource "azurerm_role_assignment" "app_files" {
  scope                = azurerm_storage_container.files.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = data.azurerm_user_assigned_identity.app.principal_id
}
