# Terraform plus what floci-az needs: its CA in the trust store and a forwarder that answers
# the Azure data-plane hostnames (*.vault.azure.net) that azurerm insists on calling.
FROM hashicorp/terraform:1.17.1@sha256:a5d5a5a892c98f60fcbfa81eac2a40fc19e7b3fa7719bccae10ff6111d22524a
# hadolint ignore=DL3018
RUN apk add --no-cache socat ca-certificates curl bash
ENTRYPOINT ["/bin/bash"]
