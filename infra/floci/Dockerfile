# Terraform plus what floci-az needs: its CA in the trust store and a forwarder that answers
# the Azure data-plane hostnames (*.vault.azure.net) that azurerm insists on calling.
FROM hashicorp/terraform:1.16.6@sha256:bfffc1ded5fbf0a17beaaf22eb4793980abdb19d0761ff6a3a0efb2ab4d9b316
# hadolint ignore=DL3018
RUN apk add --no-cache socat ca-certificates curl bash
ENTRYPOINT ["/bin/bash"]
