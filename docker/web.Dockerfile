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

FROM caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f AS production
# Listening on 8080 needs no capabilities; removing the file capability lets the
# container run with every capability dropped.
RUN addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app \
    && chown -R app:app /data /config \
    && setcap -r /usr/bin/caddy
COPY docker/Caddyfile /etc/caddy/Caddyfile
# Root-owned and read-only to the runtime user.
COPY --from=build --chown=root:root /workspace/apps/web/dist /srv
USER 10001:10001
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
