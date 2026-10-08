terraform {
  # Exact versions plus the committed .terraform.lock.hcl make every plan reproducible.
  required_version = "1.16.1"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "5.7.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.9.1"
    }
  }
  # Partial: `terraform init -backend-config=envs/<env>.backend.hcl
  #   -backend-config=storage_account_name=<TFSTATE_ACCOUNT>`. State is versioned (rollback,
  # audit) and every write takes a blob lease (locking).
  backend "azurerm" {}
}

provider "azurerm" {
  features {
    key_vault {
      # A deleted vault stays recoverable for its retention period; never purge from Terraform.
      purge_soft_delete_on_destroy = false
    }
    resource_group {
      prevent_deletion_if_contains_resources = true
    }
    storage {
      # Storage is private-endpoint only, so configure it through the management plane alone.
      data_plane_available = false
    }
  }
  storage_use_azuread = true
}
