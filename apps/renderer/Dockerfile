FROM oven/bun:1.2.18-alpine AS base

FROM base AS builder

WORKDIR /app

ARG FREESOUND_CLIENT_ID
ARG FREESOUND_API_KEY
ARG VITE_MARBLE_API_URL=https://api.marblecms.com
ARG VITE_SHOTLYX_SERVER_URL=http://localhost:8787
ARG MARBLE_WORKSPACE_KEY=build-placeholder

COPY package.json package.json
COPY bun.lock bun.lock
COPY turbo.json turbo.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/renderer/package.json apps/renderer/package.json
COPY server/package.json server/package.json
RUN bun install

COPY apps/renderer/ apps/renderer/
COPY rust/wasm/pkg/ rust/wasm/pkg/

ENV NODE_ENV=production
# Build-time env stubs to pass zod validation
ENV DATABASE_URL="postgresql://shotlyx:shotlyx@localhost:5432/shotlyx"
ENV BETTER_AUTH_SECRET="build-time-secret"
ENV UPSTASH_REDIS_REST_URL="http://localhost:8079"
ENV UPSTASH_REDIS_REST_TOKEN="example_token"
ENV VITE_SITE_URL="http://localhost:3000"
ENV VITE_SHOTLYX_SERVER_URL=$VITE_SHOTLYX_SERVER_URL
ENV VITE_MARBLE_API_URL=$VITE_MARBLE_API_URL
ENV MARBLE_WORKSPACE_KEY=$MARBLE_WORKSPACE_KEY

ENV FREESOUND_CLIENT_ID=$FREESOUND_CLIENT_ID
ENV FREESOUND_API_KEY=$FREESOUND_API_KEY

WORKDIR /app/apps/renderer
RUN bun run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
RUN addgroup --system --gid 1001 shotlyx
RUN adduser --system --uid 1001 shotlyx

COPY --from=builder --chown=shotlyx:shotlyx /app/apps/renderer/dist ./apps/renderer/dist
COPY --from=builder --chown=shotlyx:shotlyx /app/apps/renderer/scripts/serve-dist.mjs ./apps/renderer/scripts/serve-dist.mjs

USER shotlyx

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "apps/renderer/scripts/serve-dist.mjs"]
