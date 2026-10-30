# Terraform plus what floci-az needs: its CA in the trust store and a forwarder that answers
# the Azure data-plane hostnames (*.vault.azure.net) that azurerm insists on calling.
FROM hashicorp/terraform:1.17.0@sha256:4d1b496a256f2989bccdb04b9104a4ede97234b10fba90259e173e905ec4fb58
# hadolint ignore=DL3018
RUN apk add --no-cache socat ca-certificates curl bash
ENTRYPOINT ["/bin/bash"]
