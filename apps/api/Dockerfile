# ─── Overlay API (NestJS) — multi-stage production image ───
# Build from the repo root:  docker build -f apps/api/Dockerfile -t overlay-api .

FROM node:22-slim AS build
WORKDIR /app
# Prisma engines need openssl.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Install with a clean, reproducible tree (workspace manifests first for caching).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .
RUN npm run prisma:generate \
    && npm run build -w @overlay/shared \
    && npm run build -w @overlay/api

# ─── runtime ───
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist

EXPOSE 4000
# Run DB migrations at boot, then start the API. Override CMD to run the worker:
#   docker run ... overlay-api node apps/api/dist/worker.js
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node apps/api/dist/main.js"]
