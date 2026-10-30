# syntax=docker/dockerfile:1
FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS development
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# pnpm version matches "packageManager" in package.json.
RUN npm install --global pnpm@10.32.0 \
    && mkdir -p /pnpm/store /workspace \
    && chown -R node:node /pnpm /workspace
# node
USER 1000:1000
WORKDIR /workspace
# Manifests only, so source edits do not invalidate the dependency layer.
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --chown=node:node packages/contracts/package.json packages/contracts/
COPY --chown=node:node packages/tsconfig/package.json packages/tsconfig/
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1000,gid=1000 \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@cpi/web..."
COPY --chown=node:node . .
RUN pnpm --filter @cpi/contracts build

FROM development AS build
RUN pnpm --filter @cpi/web build

# The released caddy 2.11.7 binary is built with Go 1.26.8 (CVE-2026-78667, CVE-2026-97031 in
# net/http and crypto/tls). The official builder compiles the same release with Go 1.27.2; drop
# this stage once a caddy image ships with a fixed Go.
FROM caddy:2.11.7-builder-alpine@sha256:ef9b65adf9a224770c6d5f6d1ae1bf99bc3caaa78d8c4bae3ea949ee6984f301 AS caddy
RUN xcaddy build v2.11.7 --output /usr/bin/caddy

FROM caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f AS production
# Listening on 8080 needs no capabilities; removing the file capability lets the
# container run with every capability dropped.
RUN addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app \
    && chown -R app:app /data /config \
    && setcap -r /usr/bin/caddy
# Built without file capabilities.
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY docker/Caddyfile /etc/caddy/Caddyfile
# Root-owned and read-only to the runtime user.
COPY --from=build --chown=root:root /workspace/apps/web/dist /srv
USER 10001:10001
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
