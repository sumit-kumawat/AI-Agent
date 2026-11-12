# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholder only; the real secret is supplied at runtime.
RUN node scripts/copy-monaco.mjs \
  && AUTH_SECRET=build-time-placeholder-secret-not-used-at-runtime npx next build \
  && node scripts/prepare-standalone.mjs

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data
# git clones repositories into IDE workspaces; bash is the IDE terminal's shell.
# ffmpeg is optional for Creative Studio media tools when the binary is present.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git bash ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*
RUN groupadd --system harbor && useradd --system --gid harbor --shell /bin/bash harbor \
  && mkdir -p /data && chown harbor:harbor /data
COPY --from=build --chown=harbor:harbor /app/.next/standalone ./
USER harbor
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
