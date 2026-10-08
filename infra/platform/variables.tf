variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "staging or prod."
  }
}
variable "address_space" {
  type        = string
  description = "VNet /16; each environment takes its own so they can be peered later."
}
variable "api_image" {
  type        = string
  description = "Image (ghcr.io/…@sha256:…) used when the API app is first created; deployments then move it, outside Terraform."
}
variable "web_image" {
  type        = string
  description = "As api_image, for the web app."
}
variable "demo_mode" {
  type        = bool
  description = "Fictional seeded cycle with demo sign-in; true only where no real person signs in."
}
variable "admin_email" {
  type    = string
  default = ""
}
variable "email_from" {
  type    = string
  default = "CPI Platform <onboarding@resend.dev>"
}
variable "alert_emails" {
  type        = string
  default     = ""
  description = "Who alerts email: comma-separated addresses (a JSON list like [\"a@b.org\"] also works)."
}
variable "high_availability" {
  type        = bool
  description = "Zone-redundant database, cache and apps, geo-redundant backups."
}
variable "postgres_sku" {
  type = string
}
variable "redis_sku" {
  type = string
}
variable "log_retention_days" {
  type = number
}
variable "min_replicas" {
  type = number
}
variable "database_password_version" {
  type        = number
  default     = 1
  description = "Increase to rotate the database password: a new one is generated, written to PostgreSQL and Key Vault, and never stored in state."
}
variable "runner_ips" {
  type        = list(string)
  default     = []
  description = "Key Vault firewall entries when the vault is created (the deploying runner); later runs manage them with scripts/vault-firewall.sh."
}
