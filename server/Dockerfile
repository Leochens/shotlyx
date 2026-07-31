FROM oven/bun:1.2.18-alpine AS base

WORKDIR /app

COPY package.json package.json
COPY bun.lock bun.lock
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/renderer/package.json apps/renderer/package.json
COPY server/package.json server/package.json
RUN bun install --production --filter @shotlyx/server

COPY server/src/ server/src/

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

CMD ["bun", "server/src/index.ts"]
