# syntax=docker/dockerfile:1.7

FROM node:24.5.0-alpine AS build-base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /workspace

FROM alpine:3.22 AS runtime-base

COPY --from=build-base /usr/local/bin/node /usr/local/bin/node
COPY --from=build-base /usr/lib/libgcc_s.so.1 /usr/lib/libgcc_s.so.1
COPY --from=build-base /usr/lib/libstdc++.so.6* /usr/lib/
COPY --from=build-base /etc/ssl/certs/ca-certificates.crt \
  /etc/ssl/certs/ca-certificates.crt

RUN addgroup -g 1000 -S node && adduser -u 1000 -S -G node node

FROM build-base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/auth-contract/package.json packages/auth-contract/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=hop-and-barley-pnpm,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store && \
  pnpm install --frozen-lockfile --filter @hop-and-barley/web...

FROM dependencies AS builder

COPY apps/web apps/web
COPY packages/api-client packages/api-client
COPY packages/auth-contract packages/auth-contract
COPY packages/typescript-config packages/typescript-config

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_API_HOST_ALIASES
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_HOST_ALIASES=$NEXT_PUBLIC_API_HOST_ALIASES
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @hop-and-barley/auth-contract build && \
  pnpm --filter @hop-and-barley/api-client build && \
  pnpm --filter @hop-and-barley/web build

FROM runtime-base AS web

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /workspace/apps/web/public \
  ./apps/web/public
COPY --from=builder --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /workspace/apps/web/.next/static \
  ./apps/web/.next/static

USER node

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
