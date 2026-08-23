FROM node:24.5.0-alpine

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/auth-contract/package.json packages/auth-contract/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
  pnpm --filter @hop-and-barley/auth-contract build && \
  pnpm --filter @hop-and-barley/api build

EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]
