# Demonstration environment: DAST runs here, and releases are promoted from here to prod.
environment        = "staging"
address_space      = "10.40.0.0/16"
demo_mode          = true
high_availability  = false
postgres_sku       = "B_Standard_B1ms"
redis_sku          = "Balanced_B0"
log_retention_days = 90
min_replicas       = 1
