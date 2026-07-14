# ─── Overlay Web (Next.js) — standalone production image ───
# Build from the repo root:  docker build -f apps/web/Dockerfile -t overlay-web .

FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .
# NEXT_PUBLIC_* are inlined at build time — pass them as build args if needed.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
RUN npm run build -w @overlay/web

# ─── runtime ───
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Next.js standalone output bundles a minimal server + only-needed node_modules.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
