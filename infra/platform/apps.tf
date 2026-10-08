# Container Apps: the public web app (Caddy: static files, proxies /api), the internal API and
# the release job that migrates and seeds once per deployment. Terraform creates them with the
# first images; .github/workflows/deploy.yml then moves them to each release's signed digest,
# so image changes are ignored here (rollback: .github/workflows/rollback.yml).
locals {
  api_app     = "ca-${local.name}-api"
  identity_id = data.azurerm_user_assigned_identity.app.id
  portal_url  = "https://${azurerm_container_app.web.ingress[0].fqdn}"
  secrets = {
    database-url   = azurerm_key_vault_secret.database_url.versionless_id
    redis-url      = azurerm_key_vault_secret.redis_url.versionless_id
    resend-api-key = azurerm_key_vault_secret.resend_api_key.versionless_id
  }
  api_env = {
    NODE_ENV               = "production"
    API_PORT               = "3001"
    STORAGE_BACKEND        = "azure"
    AZURE_STORAGE_BLOB_URL = azurerm_storage_account.files.primary_blob_endpoint
    AZURE_CLIENT_ID        = data.azurerm_user_assigned_identity.app.client_id
    S3_BUCKET              = local.files_container
    S3_PREFIX              = "evidence/"
    DEMO_MODE              = tostring(var.demo_mode)
    REAL_DOCUMENT_UPLOADS  = "false"
    PORTAL_URL             = local.portal_url
    ADMIN_EMAIL            = var.admin_email
    EMAIL_FROM             = var.email_from
  }
  api_secret_env = {
    DATABASE_URL   = "database-url"
    REDIS_URL      = "redis-url"
    RESEND_API_KEY = "resend-api-key"
  }
}

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${local.name}"
  resource_group_name        = local.rg
  location                   = local.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  logs_destination           = "log-analytics"
  infrastructure_subnet_id   = azurerm_subnet.apps.id
  zone_redundancy_enabled    = var.high_availability
  # Encrypts web → API traffic inside the environment.
  mutual_tls_enabled = true
  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
  tags = local.tags
}

resource "azurerm_container_app" "web" {
  name                         = "ca-${local.name}-web"
  resource_group_name          = local.rg
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  identity {
    type         = "UserAssigned"
    identity_ids = [local.identity_id]
  }
  registry {
    server   = var.acr_login_server
    identity = local.identity_id
  }
  ingress {
    external_enabled = true
    target_port      = 8080
    transport        = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
  template {
    min_replicas = var.min_replicas
    max_replicas = 3
    container {
      name   = "web"
      image  = var.web_image
      cpu    = 0.25
      memory = "0.5Gi"
      env {
        name  = "API_UPSTREAM"
        value = "http://${local.api_app}"
      }
      liveness_probe {
        transport = "HTTP"
        port      = 8080
        path      = "/healthz"
      }
      readiness_probe {
        transport = "HTTP"
        port      = 8080
        path      = "/healthz"
      }
    }
    http_scale_rule {
      name                = "http"
      concurrent_requests = "100"
    }
  }
  tags = local.tags
  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }
}

resource "azurerm_container_app" "api" {
  name                         = local.api_app
  resource_group_name          = local.rg
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  identity {
    type         = "UserAssigned"
    identity_ids = [local.identity_id]
  }
  registry {
    server   = var.acr_login_server
    identity = local.identity_id
  }
  dynamic "secret" {
    for_each = local.secrets
    content {
      name                = secret.key
      key_vault_secret_id = secret.value
      identity            = local.identity_id
    }
  }
  # Reachable only from inside the environment (the web app's proxy).
  ingress {
    external_enabled = false
    target_port      = 3001
    transport        = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
  template {
    min_replicas = var.min_replicas
    max_replicas = 3
    container {
      name   = "api"
      image  = var.api_image
      cpu    = 0.5
      memory = "1Gi"
      dynamic "env" {
        for_each = merge(local.api_env, { DB_AUTO_SETUP = "false" })
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.api_secret_env
        content {
          name        = env.key
          secret_name = env.value
        }
      }
      startup_probe {
        transport               = "HTTP"
        port                    = 3001
        path                    = "/api/health/live"
        failure_count_threshold = 10
      }
      liveness_probe {
        transport = "HTTP"
        port      = 3001
        path      = "/api/health/live"
      }
      # Readiness includes PostgreSQL, Redis and storage, so a dependency outage takes the
      # replica out of rotation without restarting it.
      readiness_probe {
        transport = "HTTP"
        port      = 3001
        path      = "/api/health/ready"
      }
    }
    http_scale_rule {
      name                = "http"
      concurrent_requests = "50"
    }
  }
  tags       = local.tags
  depends_on = [azurerm_role_assignment.app_secrets, azurerm_role_assignment.app_files, azurerm_private_endpoint.main]
  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }
}

# Release step: migrations and first seed, run once before the API moves to a new image.
resource "azurerm_container_app_job" "release" {
  name                         = "caj-${local.name}-release"
  resource_group_name          = local.rg
  location                     = local.location
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 600
  replica_retry_limit          = 0
  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }
  identity {
    type         = "UserAssigned"
    identity_ids = [local.identity_id]
  }
  registry {
    server   = var.acr_login_server
    identity = local.identity_id
  }
  dynamic "secret" {
    for_each = local.secrets
    content {
      name                = secret.key
      key_vault_secret_id = secret.value
      identity            = local.identity_id
    }
  }
  template {
    container {
      name    = "release"
      image   = var.api_image
      cpu     = 0.5
      memory  = "1Gi"
      command = ["node", "dist/main.js", "--setup-only"]
      dynamic "env" {
        for_each = merge(local.api_env, { DB_AUTO_SETUP = "true" })
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.api_secret_env
        content {
          name        = env.key
          secret_name = env.value
        }
      }
    }
  }
  tags       = local.tags
  depends_on = [azurerm_role_assignment.app_secrets, azurerm_private_endpoint.main]
  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }
}
