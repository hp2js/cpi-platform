# syntax=docker/dockerfile:1
FROM node:26.9.0-trixie-slim@sha256:3a771f83944bb763050c23c0225c260638c4b7899e7a72485ef75e5e570499e5 AS development
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
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@cpi/api..."
COPY --chown=node:node . .
RUN pnpm --filter @cpi/contracts build

FROM development AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1000,gid=1000 \
    pnpm --filter @cpi/api build \
    && pnpm --filter @cpi/api deploy --legacy --prod --store-dir /pnpm/store /home/node/release

FROM node:26.9.0-trixie-slim@sha256:3a771f83944bb763050c23c0225c260638c4b7899e7a72485ef75e5e570499e5 AS production
ENV NODE_ENV=production
# The runtime only needs node; package managers are unused attack surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
# Root-owned and read-only to the runtime user.
COPY --from=build --chown=root:root /home/node/release ./
# node
USER 1000:1000
EXPOSE 3001
CMD ["node", "dist/main.js"]
