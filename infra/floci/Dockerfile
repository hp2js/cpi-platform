# Terraform plus what floci-az needs: its CA in the trust store and a forwarder that answers
# the Azure data-plane hostnames (*.vault.azure.net) that azurerm insists on calling.
FROM hashicorp/terraform:1.16.4@sha256:985cdc6c1d9b0a65b83377f666efd2f740b47f02ac55be1ced3d18f7d3b0e829
# hadolint ignore=DL3018
RUN apk add --no-cache socat ca-certificates curl bash
ENTRYPOINT ["/bin/bash"]
