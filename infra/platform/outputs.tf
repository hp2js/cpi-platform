output "portal_url" {
  value = local.portal_url
}
output "api_app" {
  value = azurerm_container_app.api.name
}
output "web_app" {
  value = azurerm_container_app.web.name
}
output "release_job" {
  value = azurerm_container_app_job.release.name
}
output "resource_group" {
  value = local.rg
}
output "key_vault" {
  value = azurerm_key_vault.main.name
}
