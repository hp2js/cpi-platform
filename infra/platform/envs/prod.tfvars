# No demo accounts or demo controls; ADMIN_EMAIL is the first administrator (set in the
# GitHub "production" environment as TF_VAR_admin_email, not committed).
environment        = "prod"
address_space      = "10.41.0.0/16"
demo_mode          = false
high_availability  = true
postgres_sku       = "GP_Standard_D2ds_v5"
redis_sku          = "Balanced_B1"
log_retention_days = 365
min_replicas       = 2
