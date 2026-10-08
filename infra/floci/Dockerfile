# Terraform plus what floci-az needs: its CA in the trust store and a forwarder that answers
# the Azure data-plane hostnames (*.vault.azure.net) that azurerm insists on calling.
FROM hashicorp/terraform:1.16.1@sha256:f4d9594d2c8010c03f0149352682166410c58c21d46344cf256fd5a4b721a011
# hadolint ignore=DL3018
RUN apk add --no-cache socat ca-certificates curl bash
ENTRYPOINT ["/bin/bash"]
