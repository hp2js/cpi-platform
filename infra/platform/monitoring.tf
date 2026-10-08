# Observability: logs from every app and service land in one workspace; alerts page the
# action group; the workbook is the operations dashboard. Audit logs (Key Vault, storage,
# PostgreSQL) are kept for log_retention_days.
resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${local.name}"
  resource_group_name = local.rg
  location            = local.location
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_days
  tags                = local.tags
}

resource "azurerm_application_insights" "main" {
  name                = "appi-${local.name}"
  resource_group_name = local.rg
  location            = local.location
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"
  tags                = local.tags
}

# Availability from outside Azure's network, through the public web app to API readiness
# (database, Redis and storage).
resource "azurerm_application_insights_standard_web_test" "ready" {
  name                    = "webtest-${local.name}-ready"
  resource_group_name     = local.rg
  location                = local.location
  application_insights_id = azurerm_application_insights.main.id
  geo_locations           = ["emea-ru-msa-edge", "emea-nl-ams-azr", "emea-gb-db3-azr"]
  frequency               = 300
  timeout                 = 30
  retry_enabled           = true
  request {
    url = "${local.portal_url}/api/health/ready"
  }
  validation_rules {
    expected_status_code        = 200
    ssl_check_enabled           = true
    ssl_cert_remaining_lifetime = 14
  }
  tags = local.tags
}

resource "azurerm_monitor_action_group" "main" {
  name                = "ag-${local.name}"
  resource_group_name = local.rg
  short_name          = substr("cpi${var.environment}", 0, 12)
  dynamic "email_receiver" {
    for_each = var.alert_emails
    content {
      name                    = "email-${email_receiver.key}"
      email_address           = email_receiver.value
      use_common_alert_schema = true
    }
  }
  tags = local.tags
}

resource "azurerm_monitor_metric_alert" "availability" {
  name                = "alert-${local.name}-availability"
  resource_group_name = local.rg
  scopes              = [azurerm_application_insights_standard_web_test.ready.id, azurerm_application_insights.main.id]
  description         = "The portal's API readiness check failed from two or more locations."
  severity            = 1
  frequency           = "PT1M"
  window_size         = "PT5M"
  application_insights_web_test_location_availability_criteria {
    web_test_id           = azurerm_application_insights_standard_web_test.ready.id
    component_id          = azurerm_application_insights.main.id
    failed_location_count = 2
  }
  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }
  tags = local.tags
}

locals {
  metric_alerts = {
    api-5xx = {
      scope       = azurerm_container_app.api.id, namespace = "Microsoft.App/containerApps"
      metric      = "Requests", aggregation = "Total", threshold = 10, severity = 2
      dimension   = { name = "statusCodeCategory", values = ["5xx"] }
      description = "More than 10 API 5xx responses in 5 minutes."
    }
    api-restarts = {
      scope       = azurerm_container_app.api.id, namespace = "Microsoft.App/containerApps"
      metric      = "RestartCount", aggregation = "Maximum", threshold = 2, severity = 2
      dimension   = null
      description = "API replicas are restarting (failed liveness or crashes)."
    }
    postgres-cpu = {
      scope       = azurerm_postgresql_flexible_server.main.id, namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
      metric      = "cpu_percent", aggregation = "Average", threshold = 80, severity = 3
      dimension   = null
      description = "PostgreSQL CPU above 80%."
    }
    postgres-storage = {
      scope       = azurerm_postgresql_flexible_server.main.id, namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
      metric      = "storage_percent", aggregation = "Average", threshold = 80, severity = 2
      dimension   = null
      description = "PostgreSQL storage above 80% (auto-grow is on; check growth)."
    }
  }
}

resource "azurerm_monitor_metric_alert" "main" {
  for_each            = local.metric_alerts
  name                = "alert-${local.name}-${each.key}"
  resource_group_name = local.rg
  scopes              = [each.value.scope]
  description         = each.value.description
  severity            = each.value.severity
  frequency           = "PT1M"
  window_size         = "PT5M"
  criteria {
    metric_namespace = each.value.namespace
    metric_name      = each.value.metric
    aggregation      = each.value.aggregation
    operator         = "GreaterThan"
    threshold        = each.value.threshold
    dynamic "dimension" {
      for_each = each.value.dimension == null ? [] : [each.value.dimension]
      content {
        name     = dimension.value.name
        operator = "Include"
        values   = dimension.value.values
      }
    }
  }
  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }
  tags = local.tags
}

# API and release-job logs are JSON lines: {"level", "context", "message": {"event", ...}}.
locals {
  events     = <<-KQL
    ContainerAppConsoleLogs_CL
    | extend entry = parse_json(Log_s)
    | extend event = tostring(entry.message.event), level = tostring(entry.level)
  KQL
  api_events = "${local.events}| where ContainerAppName_s == '${local.api_app}'\n"
  log_alerts = {
    dependency-failure = {
      severity    = 1
      description = "The API reported PostgreSQL, Redis or storage unreachable."
      query       = "${local.api_events}| where event == 'dependency.failure'"
    }
    migration-failed = {
      severity    = 1
      description = "A release job failed to migrate the database; the API still runs the previous image."
      query       = "${local.events}| where event in ('database.migration_failed', 'config.invalid', 'api.startup_failed')"
    }
    email-delivery = {
      severity    = 3
      description = "The notification delivery worker is failing."
      query       = "${local.api_events}| where event in ('delivery.worker_failed', 'email.send_failed')"
    }
    vault-denied = {
      severity    = 2
      description = "Key Vault refused a request (unauthorized identity or network)."
      query       = "AzureDiagnostics | where ResourceProvider == 'MICROSOFT.KEYVAULT' and httpStatusCode_d in (401, 403)"
    }
  }
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "main" {
  for_each             = local.log_alerts
  name                 = "alert-${local.name}-${each.key}"
  resource_group_name  = local.rg
  location             = local.location
  scopes               = [azurerm_log_analytics_workspace.main.id]
  description          = each.value.description
  severity             = each.value.severity
  evaluation_frequency = "PT5M"
  window_duration      = "PT5M"
  # Tables appear only after the first log line, so queries may not validate on a new workspace.
  skip_query_validation = true
  criteria {
    query                   = each.value.query
    time_aggregation_method = "Count"
    operator                = "GreaterThan"
    threshold               = 0
  }
  action {
    action_groups = [azurerm_monitor_action_group.main.id]
  }
  tags = local.tags
}

# --- Audit trail: data-plane access to secrets, files and the database ----------------------
locals {
  diagnostics = {
    vault    = { id = azurerm_key_vault.main.id, groups = ["audit"] }
    blob     = { id = "${azurerm_storage_account.files.id}/blobServices/default", groups = ["audit"] }
    postgres = { id = azurerm_postgresql_flexible_server.main.id, groups = ["audit", "allLogs"] }
  }
}

resource "azurerm_monitor_diagnostic_setting" "main" {
  for_each                   = local.diagnostics
  name                       = "to-${azurerm_log_analytics_workspace.main.name}"
  target_resource_id         = each.value.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  dynamic "enabled_log" {
    for_each = toset(each.value.groups)
    content {
      category_group = enabled_log.value
    }
  }
  enabled_metric {
    category = "AllMetrics"
  }
}

# --- Dashboard ----------------------------------------------------------------------------
resource "azurerm_application_insights_workbook" "operations" {
  # Workbook names must be GUIDs; derive a stable one.
  name                = uuidv5("url", "https://cpi-platform/${var.environment}/operations")
  resource_group_name = local.rg
  location            = local.location
  display_name        = "CPI ${var.environment} operations"
  source_id           = lower(azurerm_log_analytics_workspace.main.id)
  data_json = jsonencode({
    version = "Notebook/1.0"
    items = [
      for index, tile in [
        {
          title = "API requests by status (5 min)"
          query = "${local.api_events}| where event == 'http.request' | extend status = toint(entry.message.status) | summarize count() by bin(TimeGenerated, 5m), statusClass = strcat(tostring(status / 100), 'xx') | render timechart"
        },
        {
          title = "API latency p50 / p95 (ms)"
          query = "${local.api_events}| where event == 'http.request' | extend ms = todouble(entry.message.durationMs) | summarize p50 = percentile(ms, 50), p95 = percentile(ms, 95) by bin(TimeGenerated, 5m) | render timechart"
        },
        {
          title = "Errors and dependency events"
          query = "${local.api_events}| where level in ('error', 'warn') or event startswith 'dependency.' | project TimeGenerated, level, event, RevisionName_s | order by TimeGenerated desc | take 100"
        },
        {
          title = "Availability (readiness check)"
          query = "AppAvailabilityResults | summarize availability = 100.0 * countif(Success == true) / count() by bin(TimeGenerated, 15m), Location | render timechart"
        },
        {
          title = "Revisions and restarts"
          query = "ContainerAppSystemLogs_CL | where Reason_s in ('RevisionReady', 'RevisionDeactivating', 'ContainerTerminated', 'ProbeFailed') | project TimeGenerated, ContainerAppName_s, RevisionName_s, Reason_s, Log_s | order by TimeGenerated desc | take 100"
        },
        {
          title = "Key Vault access"
          query = "AzureDiagnostics | where ResourceProvider == 'MICROSOFT.KEYVAULT' | summarize count() by OperationName, httpStatusCode_d, identity_claim_xms_mirid_s"
        },
        ] : {
        type = 3
        name = "tile-${index}"
        content = {
          version      = "KqlItem/1.0"
          title        = tile.title
          query        = tile.query
          queryType    = 0
          resourceType = "microsoft.operationalinsights/workspaces"
          timeContext  = { durationMs = 86400000 }
          size         = 0
        }
      }
    ]
  })
  tags = local.tags
}
