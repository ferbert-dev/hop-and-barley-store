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
COPY apps/api/package.json apps/api/package.json
COPY apps/api-migrate/package.json apps/api-migrate/package.json
COPY packages/auth-contract/package.json packages/auth-contract/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=hop-and-barley-pnpm,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store && \
  pnpm install --frozen-lockfile \
    --filter @hop-and-barley/api... \
    --filter @hop-and-barley/api-migrate...

FROM dependencies AS builder

COPY apps/api apps/api
COPY apps/api-migrate apps/api-migrate
COPY packages/auth-contract packages/auth-contract
COPY packages/typescript-config packages/typescript-config

RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
  pnpm --filter @hop-and-barley/auth-contract build && \
  pnpm --filter @hop-and-barley/api build && \
  pnpm --filter @hop-and-barley/api exec tsc -p tsconfig.seed.json

RUN pnpm --filter @hop-and-barley/api \
      deploy --legacy --prod --no-optional /opt/api && \
  pnpm --filter @hop-and-barley/auth-contract \
      deploy --legacy --prod --no-optional /opt/auth-contract && \
  pnpm --filter @hop-and-barley/api-migrate \
      deploy --legacy --prod --no-optional /opt/migrate && \
  rm -rf /opt/migrate/node_modules/.pnpm/@prisma+studio-core@*/node_modules/@prisma/studio-core/dist/ui && \
  for sharp_modules in /opt/api/node_modules/.pnpm/sharp@*/node_modules; do \
    rm -rf "$sharp_modules/@img" && \
    mkdir -p "$sharp_modules/@img" && \
    cp -aL /workspace/node_modules/.pnpm/sharp@*/node_modules/@img/. \
      "$sharp_modules/@img/"; \
  done

FROM runtime-base AS api

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /opt/api/package.json ./package.json
COPY --from=builder /opt/api/node_modules ./node_modules
COPY --from=builder /opt/auth-contract/package.json ./packages/auth-contract/package.json
COPY --from=builder /opt/auth-contract/node_modules ./packages/auth-contract/node_modules
COPY --from=builder /opt/auth-contract/dist ./packages/auth-contract/dist
COPY --from=builder /workspace/apps/api/dist ./dist

RUN rm -f node_modules/@hop-and-barley/auth-contract && \
  ln -s ../../packages/auth-contract node_modules/@hop-and-barley/auth-contract && \
  mkdir -p /var/lib/hop-and-barley/product-assets

EXPOSE 3001

CMD ["node", "dist/main.js"]

FROM runtime-base AS migrate

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /opt/migrate/package.json ./package.json
COPY --from=builder /opt/migrate/node_modules ./node_modules
COPY --from=builder /workspace/apps/api/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /workspace/apps/api/prisma/migrations ./prisma/migrations
COPY --from=builder /workspace/apps/api/prisma.config.ts ./prisma.config.ts

CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]
