# Copied next to each stack by apply.sh: points azurerm at floci-az with dummy credentials
# (floci-az does not validate them) and keeps state local.
terraform {
  backend "local" {}
}
provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = false
    }
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
    storage {
      data_plane_available = false
    }
  }
  metadata_host                   = "floci-az:4577"
  resource_provider_registrations = "none"
  use_cli                         = false
  subscription_id                 = "00000000-0000-0000-0000-000000000001"
  tenant_id                       = "00000000-0000-0000-0000-000000000002"
  client_id                       = "00000000-0000-0000-0000-000000000003"
  client_secret                   = "floci-az-accepts-any-secret"
}
