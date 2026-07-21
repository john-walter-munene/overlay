# syntax=docker/dockerfile:1
# Monorepo-aware image for the Overlay Bets API + settlement worker.
# Build context MUST be the repo root (it needs prisma/, packages/shared, apps/api).
#
#   docker build -t overlay-api .
#   # API:    docker run -p 4000:4000 --env-file .env overlay-api
#   # Worker: docker run --env-file .env overlay-api node apps/api/dist/worker.js
#
# See docs/PROD-READINESS-BACKLOG.md OB-100.

# ---- Builder ----------------------------------------------------------------
FROM node:26-bookworm-slim AS builder
WORKDIR /app

# Prisma engines need openssl at generate/runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching). Copy only the manifests
# that npm needs to resolve the workspace graph.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# Copy the sources needed to build the API (not the web app).
COPY tsconfig.base.json ./
COPY prisma ./prisma
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Generate the Prisma client, then build shared -> api (order matters).
RUN npm run prisma:generate \
 && npm run build -w @overlay/shared \
 && npm run build -w @overlay/api

# Strip dev-only packages from node_modules so they don't land in the runtime
# image. This removes build tools (e.g. @nestjs/cli and its transitive deps
# like glob, picomatch, tmp) that aren't needed at runtime.
RUN npm prune --omit=dev

# ---- Runtime ----------------------------------------------------------------
FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g npm@latest \
 && npm cache clean --force

# Bring over installed deps (incl. generated Prisma client + workspace symlink)
# and the compiled output. Source TS is intentionally left out of the image.
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/start-api.sh ./apps/api/start-api.sh
COPY --from=builder /app/prisma ./prisma

# Run as the built-in non-root user.
USER node

EXPOSE 4000

# Default process is the HTTP API. Start the worker by overriding the command:
#   node apps/api/dist/worker.js
CMD ["node", "apps/api/dist/main.js"]
