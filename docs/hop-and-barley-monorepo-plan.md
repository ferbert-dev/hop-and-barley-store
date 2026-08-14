# Hop & Barley Store — план профессиональной монорепы

> **Назначение:** архитектурный blueprint для portfolio-проекта интернет-магазина на **Next.js + NestJS**.  
> **Репозиторий:** `hop-and-barley-store`  
> **Актуализировано:** 14 августа 2026 года  
> **Статус:** рекомендуемая целевая структура; внедрять поэтапно, не создавая пустые пакеты «на будущее».

---

## 1. Итоговое архитектурное решение

Использовать **один GitHub-репозиторий** и несколько независимо собираемых приложений:

```text
pnpm workspace
└── Turborepo
    ├── apps/web       → Next.js storefront/admin UI
    ├── apps/api       → NestJS REST API
    ├── apps/e2e       → Playwright end-to-end tests
    └── packages/*     → общие конфигурации и генерируемый API client
```

### Основные решения

- **Package manager:** pnpm Workspace.
- **Task orchestrator:** Turborepo.
- **Frontend:** Next.js, App Router, TypeScript.
- **Backend:** NestJS как **модульный монолит**.
- **Database:** PostgreSQL.
- **ORM:** Prisma — рекомендуемый вариант для этого проекта.
- **API contract:** NestJS OpenAPI/Swagger → генерируемый TypeScript client.
- **Frontend tests:** Vitest + React Testing Library.
- **Backend tests:** Jest + Supertest.
- **Full-stack E2E:** Playwright.
- **Containers:** отдельные multi-stage Dockerfile для `web` и `api`.
- **Local infrastructure:** Docker Compose.
- **CI:** GitHub Actions.
- **Code quality:** ESLint Flat Config с typed linting, Prettier, Husky, lint-staged, Commitlint.

### Почему именно так

1. Frontend и backend остаются независимыми приложениями и могут деплоиться отдельно.
2. Один pull request может атомарно изменить API, frontend и тесты.
3. Общие конфигурации не копируются между приложениями.
4. OpenAPI устраняет ручное дублирование API-типов.
5. Turborepo предоставляет единые команды, граф задач и кэширование.
6. Для одного магазина микросервисы пока не дают пользы, но сильно увеличивают сложность.

---

## 2. Рекомендуемый baseline версий

Снимок рекомендуемого baseline на дату документа:

| Компонент | Рекомендация |
|---|---|
| Node.js | `24.x LTS` |
| pnpm | `11.21.0` или более новый стабильный `11.x` |
| Turborepo | `2.10.9` или более новый стабильный `2.x` |
| Next.js | стабильный `16.3.x` |
| NestJS | стабильный `11.x` |
| TypeScript | последняя стабильная версия, поддерживаемая одновременно Next.js и NestJS |
| PostgreSQL | зафиксированный поддерживаемый major, без Docker-тега `latest` |

### Политика версий

- Зафиксировать точную версию pnpm в корневом `package.json`.
- Коммитить единственный корневой `pnpm-lock.yaml`.
- Не использовать prerelease-версии pnpm, Next.js или Turborepo в portfolio-проекте.
- Docker images фиксировать хотя бы по major/minor, а для production — предпочтительно по digest.
- Dependabot или Renovate должны предлагать обновления отдельными pull request.

---

## 3. Архитектурные принципы

### 3.1. Приложения независимо собираются и запускаются

`apps/web` не должен импортировать исходный код из `apps/api`.

Плохо:

```ts
import { ProductEntity } from '../../api/src/modules/products/product.entity';
```

Правильно:

```ts
import type { ProductDto } from '@hop-and-barley/api-client';
```

### 3.2. Backend entity не является API contract

Нужно разделять:

```text
Database model
    ↓
Repository / persistence mapping
    ↓
Application model
    ↓
Response DTO
    ↓
OpenAPI document
    ↓
Generated frontend client
```

Это предотвращает утечки:

- password hash;
- внутренних database-полей;
- ORM metadata;
- служебных timestamps;
- полей, которые frontend не должен видеть.

### 3.3. API является единственным владельцем бизнес-логики

Frontend не должен рассчитывать окончательную стоимость заказа, остатки или скидки как источник истины.

Backend обязан повторно проверить:

- цену;
- доступное количество;
- скидку;
- итоговую сумму;
- права пользователя;
- возможность перехода заказа в новый статус.

### 3.4. Модульный монолит вместо преждевременных микросервисов

На первом этапе не нужны:

- Kafka;
- service discovery;
- отдельные deployment для каждой domain-функции;
- distributed transactions;
- отдельные базы данных для модулей.

NestJS-приложение делится на бизнес-модули, но собирается и деплоится как один сервис.

### 3.5. Не создавать пустые packages

Сразу нужны:

- `eslint-config`;
- `typescript-config`;
- `api-client`.

Создавать `ui` и `test-utils` следует тогда, когда появляется первый реальный reusable-компонент или общий test helper.

---

## 4. Целевая структура репозитория

```text
hop-and-barley-store/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── docker.yml
│   │   └── codeql.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   └── feature_request.yml
│   ├── pull_request_template.md
│   └── dependabot.yml
│
├── .husky/
│   ├── pre-commit
│   └── commit-msg
│
├── .vscode/
│   ├── extensions.json
│   └── settings.json
│
├── apps/
│   ├── web/
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── lib/
│   │   │   ├── styles/
│   │   │   ├── test/
│   │   │   └── proxy.ts                 # только если реально требуется
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── eslint.config.mjs
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.mts
│   │   └── vitest.setup.ts
│   │
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── common/
│   │   │   ├── config/
│   │   │   ├── database/
│   │   │   ├── modules/
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── test/
│   │   │   ├── e2e/
│   │   │   ├── integration/
│   │   │   ├── fixtures/
│   │   │   └── jest-e2e.json
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── eslint.config.mjs
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   ├── tsconfig.build.json
│   │   └── tsconfig.json
│   │
│   └── e2e/
│       ├── fixtures/
│       ├── pages/
│       ├── tests/
│       ├── .env.example
│       ├── package.json
│       ├── playwright.config.ts
│       └── tsconfig.json
│
├── packages/
│   ├── api-client/
│   │   ├── src/
│   │   │   ├── generated/
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── eslint-config/
│   │   ├── base.mjs
│   │   ├── nest.mjs
│   │   ├── next.mjs
│   │   ├── test.mjs
│   │   └── package.json
│   │
│   ├── typescript-config/
│   │   ├── base.json
│   │   ├── nest.json
│   │   ├── nextjs.json
│   │   ├── node-library.json
│   │   └── package.json
│   │
│   ├── ui/                              # добавить при первом reuse
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── test-utils/                      # добавить при первом reuse
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
│
├── docs/
│   ├── adr/
│   │   ├── 0001-use-pnpm-turborepo.md
│   │   ├── 0002-use-modular-monolith.md
│   │   ├── 0003-openapi-as-contract.md
│   │   └── 0004-use-prisma-postgresql.md
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── backend-modules.md
│   │   ├── data-model.md
│   │   └── testing-strategy.md
│   └── diagrams/
│       └── system-context.mmd
│
├── infra/
│   ├── docker/
│   │   └── postgres/
│   │       └── init/
│   └── observability/                   # опционально на позднем этапе
│
├── scripts/
│   ├── generate-openapi.mts
│   ├── check-generated-client.mts
│   └── wait-for-service.mts
│
├── .dockerignore
├── .editorconfig
├── .env.example                         # только переменные Compose
├── .gitattributes
├── .gitignore
├── .npmrc
├── .nvmrc
├── .prettierignore
├── commitlint.config.mjs
├── compose.dev.yaml
├── compose.demo.yaml
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── prettier.config.mjs
├── README.md
├── SECURITY.md
└── turbo.json
```

---

## 5. Workspace naming

Использовать единый npm scope:

```text
@hop-and-barley/web
@hop-and-barley/api
@hop-and-barley/e2e
@hop-and-barley/api-client
@hop-and-barley/eslint-config
@hop-and-barley/typescript-config
@hop-and-barley/ui
@hop-and-barley/test-utils
```

Все внутренние пакеты должны быть private:

```json
{
  "private": true
}
```

Внутренние зависимости указывать через workspace protocol:

```json
{
  "dependencies": {
    "@hop-and-barley/api-client": "workspace:*"
  }
}
```

---

## 6. Корневые workspace-файлы

### 6.1. `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Не включать сюда:

- `dist`;
- `.next`;
- generated Docker output;
- временные каталоги;
- вложенные demo-проекты.

### 6.2. Корневой `package.json`

Это blueprint, который можно адаптировать после создания приложений:

```json
{
  "name": "hop-and-barley-store",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@11.21.0",
  "engines": {
    "node": ">=24 <25",
    "pnpm": ">=11 <12"
  },
  "scripts": {
    "dev": "turbo run dev",
    "dev:infra": "docker compose -f compose.dev.yaml up -d",
    "dev:infra:down": "docker compose -f compose.dev.yaml down",
    "build": "turbo run build",
    "clean": "turbo run clean",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "test:e2e": "turbo run test:e2e",
    "api:generate": "turbo run generate:api-client",
    "db:migrate:dev": "pnpm --filter @hop-and-barley/api db:migrate:dev",
    "db:migrate:deploy": "pnpm --filter @hop-and-barley/api db:migrate:deploy",
    "db:seed": "pnpm --filter @hop-and-barley/api db:seed",
    "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build",
    "check:full": "pnpm check && pnpm test:integration && pnpm test:e2e",
    "prepare": "husky"
  }
}
```

### 6.3. `turbo.json`

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build", "generate"],
      "outputs": [
        "dist/**",
        ".next/**",
        "!.next/cache/**"
      ]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "generate": {
      "dependsOn": ["^generate"],
      "outputs": [
        "src/generated/**",
        "openapi.json"
      ]
    },
    "generate:api-client": {
      "dependsOn": ["generate"],
      "outputs": [
        "src/generated/**"
      ]
    },
    "lint": {
      "dependsOn": ["^lint"],
      "outputs": []
    },
    "lint:fix": {
      "cache": false,
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:unit": {
      "outputs": ["coverage/**"]
    },
    "test:integration": {
      "cache": false,
      "outputs": ["coverage/**"]
    },
    "test:e2e": {
      "cache": false,
      "outputs": [
        "playwright-report/**",
        "test-results/**"
      ]
    },
    "clean": {
      "cache": false
    },
    "db:migrate:dev": {
      "cache": false
    },
    "db:migrate:deploy": {
      "cache": false
    },
    "db:seed": {
      "cache": false
    }
  }
}
```

### Важное замечание

`turbo.json` должен отражать реальные scripts каждого workspace. Не оставлять задачи, которых нет ни в одном package.

---

## 7. Frontend: `apps/web`

## 7.1. Рекомендуемая структура

```text
apps/web/src/
├── app/
│   ├── (store)/
│   │   ├── page.tsx
│   │   ├── products/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/
│   │   │       └── page.tsx
│   │   ├── cart/
│   │   │   └── page.tsx
│   │   └── checkout/
│   │       └── page.tsx
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── account/
│   │   └── orders/
│   ├── admin/
│   │   ├── products/
│   │   ├── inventory/
│   │   └── orders/
│   ├── error.tsx
│   ├── global-error.tsx
│   ├── layout.tsx
│   ├── loading.tsx
│   ├── not-found.tsx
│   └── robots.ts
│
├── components/
│   ├── layout/
│   └── ui/
│
├── features/
│   ├── auth/
│   ├── cart/
│   ├── catalog/
│   ├── checkout/
│   ├── orders/
│   └── product-search/
│
├── lib/
│   ├── api/
│   │   ├── server-client.ts
│   │   ├── browser-client.ts
│   │   └── errors.ts
│   ├── env/
│   ├── formatting/
│   └── validation/
│
├── styles/
├── test/
│   ├── fixtures/
│   ├── mocks/
│   └── setup.ts
│
└── proxy.ts
```

`proxy.ts` добавлять только при необходимости. Не использовать его как замену полноценной backend-логике.

## 7.2. Feature-first организация

Внутри сложной feature:

```text
features/catalog/
├── api/
├── components/
├── hooks/
├── schemas/
├── types/
├── utils/
└── index.ts
```

Правила:

- route-файлы должны оставаться тонкими;
- feature-specific component хранить внутри feature;
- truly reusable primitive переносить в `components/ui` или `packages/ui`;
- не создавать один гигантский каталог `utils`;
- не экспортировать весь модуль через uncontrolled barrel files.

## 7.3. Server Components и client state

Приоритет:

1. Product/catalog pages получать данные в Server Components.
2. Client Components использовать только для интерактивности.
3. Server state не копировать автоматически в Redux/Zustand.
4. TanStack Query добавлять для client-heavy flows: cart, admin tables, optimistic updates.
5. Глобальный store использовать только для действительно глобального UI-state.

## 7.4. `next.config.ts`

Рекомендуемые настройки:

```ts
import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  transpilePackages: [
    '@hop-and-barley/api-client',
    '@hop-and-barley/ui'
  ]
};

export default nextConfig;
```

Дополнительно:

- включить typed routes, если они стабильны в выбранной patch-версии;
- описать remote image patterns, а не разрешать любые image hosts;
- не хранить backend secret в `NEXT_PUBLIC_*`;
- для production использовать same-origin routing или reverse proxy для `/api`.

## 7.5. API access

Нужны два адаптера:

```text
server-client.ts  → вызовы из Server Components
browser-client.ts → вызовы из Client Components
```

Пример env-модели:

```text
API_INTERNAL_URL=http://api:3001
NEXT_PUBLIC_API_BASE_PATH=/api/v1
```

В production желательно:

```text
https://shop.example.com/        → Next.js
https://shop.example.com/api/v1  → NestJS
```

Это упрощает:

- cookies;
- CORS;
- CSRF protection;
- browser configuration;
- observability одного пользовательского запроса.

---

## 8. Backend: `apps/api`

## 8.1. Бизнес-модули

```text
apps/api/src/modules/
├── auth/
├── users/
├── catalog/
├── categories/
├── inventory/
├── cart/
├── orders/
├── payments/
├── admin/
└── health/
```

На MVP достаточно:

```text
catalog
categories
inventory
cart
orders
auth
users
health
```

`payments` сначала должен работать через fake/sandbox adapter. Никогда не хранить card details.

## 8.2. Структура модуля

Для обычного CRUD-модуля:

```text
catalog/
├── dto/
│   ├── create-product.dto.ts
│   ├── update-product.dto.ts
│   ├── product-query.dto.ts
│   └── product-response.dto.ts
├── persistence/
│   ├── product.repository.ts
│   └── prisma-product.repository.ts
├── catalog.controller.ts
├── catalog.mapper.ts
├── catalog.module.ts
├── catalog.service.ts
└── catalog.service.spec.ts
```

Для сложного domain-модуля, например orders:

```text
orders/
├── application/
│   ├── create-order.use-case.ts
│   ├── cancel-order.use-case.ts
│   └── ports/
├── domain/
│   ├── order.ts
│   ├── order-status.ts
│   └── order.errors.ts
├── infrastructure/
│   ├── prisma-order.repository.ts
│   └── payment-provider.adapter.ts
├── presentation/
│   ├── dto/
│   └── orders.controller.ts
└── orders.module.ts
```

Не нужно насильно применять полную Clean Architecture к каждому простому lookup-модулю. Усложнять структуру следует там, где есть реальная бизнес-логика.

## 8.3. Общая backend-инфраструктура

```text
src/common/
├── decorators/
├── errors/
├── filters/
├── guards/
├── interceptors/
├── logging/
├── pagination/
├── pipes/
└── request-context/

src/config/
├── app.config.ts
├── auth.config.ts
├── database.config.ts
├── env.schema.ts
└── index.ts

src/database/
├── prisma.module.ts
├── prisma.service.ts
└── transaction.ts
```

## 8.4. Bootstrap приложения

В `main.ts` настроить:

- global prefix: `/api`;
- API versioning или согласованный `/api/v1`;
- global `ValidationPipe`;
- `whitelist: true`;
- `forbidNonWhitelisted: true`;
- `transform: true`;
- CORS allowlist;
- Helmet;
- structured logging;
- request/correlation ID;
- global exception filter;
- OpenAPI;
- shutdown hooks;
- readiness/liveness endpoints.

## 8.5. Формат ошибок

Рекомендуется единый response:

```json
{
  "type": "https://hop-and-barley.dev/problems/product-not-found",
  "title": "Product not found",
  "status": 404,
  "detail": "Product with id '...' does not exist",
  "instance": "/api/v1/products/...",
  "traceId": "..."
}
```

Frontend должен обрабатывать типизированные error codes, а не сравнивать тексты сообщений.

---

## 9. Database и persistence

## 9.1. Рекомендуемый data model

```text
User
Address
Category
Product
ProductImage
InventoryItem
Cart
CartItem
Order
OrderItem
PaymentAttempt
```

### Критически важные правила

- Деньги не хранить в `float` или JavaScript fractional number.
- Использовать integer minor units, например `priceMinor = 1299`, и `currency = EUR`.
- `OrderItem` хранит snapshot названия, SKU и цены на момент заказа.
- Итог заказа рассчитывается на backend.
- Product лучше архивировать, а не физически удалять, если он использован в заказах.
- Создать indexes для slug, SKU, category, order user/status и product search.
- Все schema migrations коммитить.
- Не использовать `db push` как production migration strategy.
- Seed должен быть повторяемым и предсказуемым.
- Test data не должна попадать в production database.

## 9.2. Inventory correctness

При создании заказа:

1. Повторно прочитать актуальные цены.
2. Проверить остаток.
3. Создать order и order items.
4. Зарезервировать или уменьшить inventory.
5. Зафиксировать изменения в database transaction.
6. Использовать idempotency key, чтобы retry не создавал второй заказ.

Для MVP это можно реализовать внутри одной PostgreSQL transaction. Kafka и Saga здесь не нужны.

## 9.3. Prisma layout

```text
apps/api/prisma/
├── schema.prisma
├── migrations/
└── seed.ts
```

Backend code не должен разбрасывать прямые Prisma calls по controllers. Prisma должен находиться за service/repository boundary.

---

## 10. OpenAPI и generated API client

## 10.1. Источник истины

Источник истины:

```text
NestJS route + DTO metadata
          ↓
      openapi.json
          ↓
packages/api-client/src/generated
          ↓
        Next.js
```

Не поддерживать вручную параллельно:

- backend DTO;
- ручной `frontend/types/api.ts`;
- отдельный `packages/contracts` с теми же полями.

## 10.2. Скрипты

В API:

```json
{
  "scripts": {
    "generate:openapi": "tsx ../../scripts/generate-openapi.mts"
  }
}
```

В API client:

```json
{
  "scripts": {
    "generate": "openapi-typescript ../../apps/api/openapi.json -o src/generated/schema.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit"
  }
}
```

В CI:

```text
1. Generate OpenAPI
2. Generate API client
3. git diff --exit-code
```

Если diff существует, разработчик забыл закоммитить обновлённый client.

## 10.3. Generated code policy

- `src/generated` нельзя редактировать вручную.
- Generated files исключить из строгих lint-правил и coverage.
- Thin handwritten wrapper должен отвечать за:
  - base URL;
  - auth headers/cookies;
  - timeout;
  - request ID;
  - error normalization.

---

## 11. Internal packages

## 11.1. `@hop-and-barley/eslint-config`

```text
eslint-config/
├── base.mjs
├── next.mjs
├── nest.mjs
├── test.mjs
└── package.json
```

### `base.mjs`

Должен включать:

- ESLint recommended;
- typescript-eslint recommended type-checked;
- typescript-eslint stylistic type-checked;
- unused imports;
- consistent type imports;
- promise safety;
- exhaustive switch checks;
- import boundaries;
- Prettier conflict disabling.

### `next.mjs`

Дополнительно:

- `eslint-config-next/core-web-vitals`;
- React Hooks;
- accessibility;
- Testing Library rules для test files;
- запрет случайного server-only code в Client Components.

### `nest.mjs`

Дополнительно:

- Node globals;
- promise rules;
- запрет floating promises;
- строгие rules для unsafe values;
- разумные exceptions для decorators и dependency injection.

### `test.mjs`

Точечно смягчать только rules, которые мешают mocks/fixtures. Не отключать typed lint полностью для всех tests.

## 11.2. `@hop-and-barley/typescript-config`

```text
typescript-config/
├── base.json
├── nextjs.json
├── nest.json
├── node-library.json
└── package.json
```

### Base strictness

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true
  }
}
```

Не использовать один идентичный module configuration для Next.js и NestJS. Они должны расширять общий base, но иметь разные platform-specific настройки.

## 11.3. `@hop-and-barley/api-client`

Содержит:

- generated OpenAPI types;
- typed client;
- normalized API errors;
- request options;
- package exports.

Не содержит:

- React components;
- NestJS imports;
- database models;
- business logic.

## 11.4. `@hop-and-barley/ui`

Добавлять только при реальном reuse.

Подходящие элементы:

- Button;
- Input;
- Dialog;
- Price;
- Badge;
- FormField;
- Skeleton.

Store-specific ProductCard можно оставить в `apps/web/features/catalog`, пока не существует второго frontend consumer.

## 11.5. `@hop-and-barley/test-utils`

Добавлять после появления reuse между несколькими workspace:

- test builders;
- deterministic IDs;
- mock API server handlers;
- fake clock helpers;
- shared fixtures.

---

## 12. ESLint, TypeScript и formatting

## 12.1. ESLint Flat Config

Использовать `eslint.config.mjs`, а не legacy `.eslintrc`.

Typed linting:

```js
languageOptions: {
  parserOptions: {
    projectService: true
  }
}
```

### Рекомендуемые strict rules

- `@typescript-eslint/no-floating-promises`;
- `@typescript-eslint/no-misused-promises`;
- `@typescript-eslint/await-thenable`;
- `@typescript-eslint/consistent-type-imports`;
- `@typescript-eslint/no-unnecessary-condition`;
- `@typescript-eslint/prefer-nullish-coalescing`;
- `@typescript-eslint/switch-exhaustiveness-check`;
- `@typescript-eslint/only-throw-error`;
- `no-console` как warning в web и разрешение через logger в API;
- запрет `any`, кроме документированных adapter boundaries.

### Практический баланс

Не включать сотни opinionated rules без понимания. Хороший lint config должен:

- находить ошибки;
- поддерживать архитектурные boundaries;
- не провоцировать постоянные `eslint-disable`;
- одинаково работать локально и в CI.

## 12.2. Prettier

Prettier отвечает только за formatting. ESLint отвечает за correctness и code quality.

Root files:

```text
prettier.config.mjs
.prettierignore
```

Не запускать Prettier через ESLint plugin на каждом lint pass. Использовать отдельные commands:

```bash
pnpm format
pnpm format:check
```

## 12.3. EditorConfig

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

## 12.4. Git hooks

### `pre-commit`

Только быстрые проверки staged files:

```text
lint-staged
├── ESLint --fix
└── Prettier --write
```

### `commit-msg`

```text
commitlint --edit
```

Не запускать весь E2E suite в pre-commit. Полная проверка должна быть в CI.

### Conventional Commits

Примеры:

```text
feat(catalog): add product filtering
fix(order): prevent duplicate checkout submission
test(api): add inventory reservation integration test
docs(architecture): document OpenAPI client generation
chore(deps): update NestJS
```

---

## 13. Testing strategy

## 13.1. Матрица тестов

| Уровень | Инструмент | Где хранить | Что проверяет |
|---|---|---|---|
| Web unit | Vitest | рядом с source | formatters, schemas, hooks |
| Web component | Vitest + RTL | рядом с component | user behavior компонента |
| API unit | Jest | рядом с service/use case | business rules изолированно |
| API integration | Jest + real PostgreSQL | `apps/api/test/integration` | repository, migrations, transaction |
| API E2E | Jest + Supertest | `apps/api/test/e2e` | HTTP, validation, auth, status codes |
| Full-stack E2E | Playwright | `apps/e2e/tests` | реальные пользовательские сценарии |

## 13.2. Рекомендуемые E2E flows

1. Пользователь открывает catalog и product details.
2. Пользователь добавляет товар в cart и меняет количество.
3. Регистрация или login.
4. Checkout создаёт один order даже при повторной отправке.
5. Пользователь видит order history.
6. Admin создаёт или редактирует product.
7. Out-of-stock item нельзя заказать.

## 13.3. Integration database

Предпочтительный вариант:

- Testcontainers запускает реальный PostgreSQL;
- migrations применяются перед suite;
- каждый test изолирован transaction rollback или database reset;
- seed минимальный и deterministic.

Допустимый fallback для CI:

- PostgreSQL service container GitHub Actions;
- отдельная database schema для test run.

Не заменять integration tests моками Prisma client.

## 13.4. Coverage

Рекомендуемый старт:

- global statements/lines: около 70%;
- critical order/inventory/auth services: 85%+;
- generated code исключён;
- config/bootstrap files исключены по обоснованным причинам.

Coverage percentage не заменяет проверки важных failure scenarios.

---

## 14. Environment configuration

## 14.1. Размещение `.env`

```text
.env.example                  → только Compose-level variables
apps/web/.env.example         → Next.js variables
apps/api/.env.example         → NestJS variables
apps/e2e/.env.example         → URLs/test credentials
```

Рабочие файлы:

```text
.env
.env.local
.env.test.local
```

не коммитить.

## 14.2. Web env example

```dotenv
APP_ENV=development
API_INTERNAL_URL=http://localhost:3001
NEXT_PUBLIC_API_BASE_PATH=/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 14.3. API env example

```dotenv
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://hop_barley:hop_barley@localhost:5432/hop_barley
CORS_ORIGINS=http://localhost:3000
JWT_ACCESS_SECRET=replace-me
JWT_REFRESH_SECRET=replace-me
LOG_LEVEL=debug
```

## 14.4. Validation

- Next.js env проверять через schema при startup/build.
- NestJS env валидировать через `@nestjs/config` и schema.
- Приложение должно падать при missing required variable.
- Не использовать silent fallback для production secret.
- `NEXT_PUBLIC_*` считается публичным и попадает в browser bundle.

---

## 15. Docker architecture

## 15.1. Файлы

```text
apps/web/Dockerfile
apps/api/Dockerfile
compose.dev.yaml
compose.demo.yaml
.dockerignore
```

Не нужен один гигантский root Dockerfile для обоих приложений.

## 15.2. `compose.dev.yaml`

Назначение: запускать только local infrastructure, а приложения запускать через pnpm для fast refresh.

```text
services:
├── postgres
└── mailpit          # опционально для email flows
```

Команда:

```bash
pnpm dev:infra
pnpm dev
```

## 15.3. `compose.demo.yaml`

Назначение: полностью containerized demo:

```text
services:
├── postgres
├── migrate          # one-shot database migration job
├── api
└── web
```

Не запускать migrations автоматически одновременно в каждом API replica. Для demo использовать отдельный `migrate` service, для production — отдельный release/deployment step.

## 15.4. Dockerfile stages

Оба Dockerfile должны быть multi-stage:

```text
base
  ↓
pruner
  ↓
installer
  ↓
builder
  ↓
runner
```

### Общие правила

- Использовать стабильный Node LTS image.
- Для меньшего количества проблем с native dependencies предпочтителен `bookworm-slim`.
- Устанавливать точную стабильную pnpm version.
- Использовать `turbo prune <workspace> --docker`.
- Сначала копировать lockfile/package manifests, затем source.
- Запускать final process под non-root user.
- Копировать только runtime artifacts.
- Не включать source maps/secrets без необходимости.
- Добавить healthcheck.
- Использовать `NODE_ENV=production`.
- Не использовать `latest` tags.

## 15.5. План `apps/web/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app

# install exact pnpm + turbo

FROM base AS pruner
COPY . .
RUN turbo prune @hop-and-barley/web --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

FROM installer AS builder
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @hop-and-barley/web build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# create non-root user
# copy .next/standalone, .next/static and public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

Точный standalone output path нужно проверить после первого production build, потому что monorepo layout влияет на вложенность generated files.

## 15.6. План `apps/api/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app

# install exact pnpm + turbo

FROM base AS pruner
COPY . .
RUN turbo prune @hop-and-barley/api --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

FROM installer AS builder
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @hop-and-barley/api generate
RUN pnpm --filter @hop-and-barley/api build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# copy production dependencies, Prisma runtime and dist
# create non-root user
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
```

После выбора Prisma version необходимо проверить:

- generated client location;
- native engine/runtime requirements;
- production dependency pruning;
- migration command внутри `migrate` service.

## 15.7. Health endpoints

API:

```text
GET /api/v1/health/live
GET /api/v1/health/ready
```

Readiness проверяет database connectivity. Liveness не должна зависеть от внешних систем.

Web:

```text
GET /
```

или отдельный lightweight health route.

---

## 16. GitHub Actions

## 16.1. `ci.yml`

Запуск:

- pull request;
- push в `main`.

Pipeline:

```text
checkout
  ↓
Node 24 + pnpm cache
  ↓
pnpm install --frozen-lockfile
  ↓
format:check
  ↓
lint
  ↓
typecheck
  ↓
generate OpenAPI/client + git diff check
  ↓
unit tests
  ↓
integration tests with PostgreSQL
  ↓
build web + api
  ↓
Playwright E2E
  ↓
upload reports/artifacts
```

## 16.2. CI requirements

- Cancel previous run для той же branch.
- Minimal GitHub token permissions.
- Cache pnpm store и Turborepo.
- `--frozen-lockfile` обязателен.
- Playwright report и traces загружать при failure.
- Не логировать secrets.
- Не выполнять deployment secrets для fork pull requests.

## 16.3. `docker.yml`

Проверять:

- build `web` image;
- build `api` image;
- container health;
- optional push в GitHub Container Registry только из protected branch/tag.

## 16.4. Security automation

Добавить:

- Dependabot weekly updates;
- GitHub secret scanning;
- CodeQL;
- dependency review на pull requests;
- branch protection для `main`.

Не делать `pnpm audit` единственным security gate: он может давать как noise, так и неполное покрытие.

---

## 17. GitHub presentation

## 17.1. README structure

```text
1. Project title + one-sentence value proposition
2. Live demo
3. Screenshots / short GIF
4. Main features
5. Architecture diagram
6. Technology stack
7. Repository structure
8. Local quick start
9. Environment configuration
10. Database migrations and seed
11. Available commands
12. Testing strategy
13. API documentation
14. Docker usage
15. Architectural decisions
16. Roadmap
17. License
```

## 17.2. Что особенно важно для portfolio

Показать не только красивый UI, но и инженерное качество:

- modular backend;
- database migrations;
- transaction-safe checkout;
- generated API client;
- integration tests;
- Docker multi-stage builds;
- CI status;
- architecture diagram;
- ADR;
- clear error model;
- health checks;
- one-command startup.

## 17.3. Badges

Полезные badges:

- CI;
- coverage;
- Next.js;
- NestJS;
- PostgreSQL;
- Docker;
- license.

Не добавлять badges, которые не соответствуют реальной автоматизации.

## 17.4. Documentation

Минимум четыре ADR:

```text
0001-use-pnpm-turborepo.md
0002-use-modular-monolith.md
0003-openapi-as-contract.md
0004-use-prisma-postgresql.md
```

Каждый ADR:

```text
Context
Decision
Alternatives considered
Consequences
Status
```

---

## 18. Рекомендуемый порядок реализации

## Phase 0 — очистить и переименовать существующий проект

- Репозиторий: `hop-and-barley-store`.
- Existing Next.js code переместить через `git mv` в `apps/web`.
- Удалить nested lockfiles.
- Сохранить Git history.
- Настроить один root `pnpm-lock.yaml`.

**Acceptance criteria:**

```bash
pnpm --filter @hop-and-barley/web dev
pnpm --filter @hop-and-barley/web build
```

работают из root.

## Phase 1 — workspace foundation

Создать:

- `pnpm-workspace.yaml`;
- `turbo.json`;
- root scripts;
- `packages/typescript-config`;
- `packages/eslint-config`;
- Prettier;
- EditorConfig;
- Husky;
- lint-staged;
- Commitlint.

**Acceptance criteria:**

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

проходят из root.

## Phase 2 — NestJS + PostgreSQL vertical slice

Создать:

- `apps/api`;
- PostgreSQL Compose service;
- Prisma schema/migration;
- health module;
- catalog module;
- OpenAPI generation;
- `packages/api-client`.

Первый end-to-end vertical slice:

```text
PostgreSQL Product
    ↓
NestJS GET /products
    ↓
OpenAPI
    ↓
Generated client
    ↓
Next.js catalog page
```

Это важнее, чем сначала создавать все будущие modules.

## Phase 3 — testing foundation

Добавить:

- API unit test;
- repository integration test;
- API E2E test;
- web component test;
- Playwright catalog flow;
- coverage reports.

## Phase 4 — cart и order correctness

Реализовать:

- cart;
- inventory check;
- order creation transaction;
- price snapshot;
- idempotency;
- out-of-stock handling;
- retry-safe checkout.

## Phase 5 — auth и admin

Реализовать:

- registration/login;
- secure password hashing;
- roles/permissions;
- admin product/inventory management;
- protected routes;
- rate limit для auth endpoints.

## Phase 6 — Docker и CI hardening

Добавить:

- production Dockerfiles;
- `compose.demo.yaml`;
- migration job;
- GitHub Actions;
- Dependabot;
- CodeQL;
- branch protection.

## Phase 7 — portfolio polish

Добавить:

- screenshots;
- architecture diagram;
- seeded demo account;
- API docs;
- ADRs;
- live demo;
- concise roadmap;
- release `v1.0.0`.

---

## 19. Definition of Done

Перед публикацией проекта на GitHub должно выполняться:

- [ ] Fresh clone не требует ручного исправления path/config.
- [ ] В репозитории один lockfile.
- [ ] Node и pnpm versions зафиксированы.
- [ ] `pnpm install --frozen-lockfile` проходит.
- [ ] `pnpm check` проходит.
- [ ] Integration tests используют реальный PostgreSQL.
- [ ] `pnpm test:e2e` проходит.
- [ ] OpenAPI client не расходится с API.
- [ ] Database migrations коммитятся.
- [ ] Seed создаёт понятные demo data.
- [ ] `.env.example` существует для каждого приложения.
- [ ] Secrets отсутствуют в Git history.
- [ ] Web и API images собираются.
- [ ] Containers работают под non-root user.
- [ ] API имеет liveness/readiness.
- [ ] README объясняет запуск максимум несколькими командами.
- [ ] README содержит screenshots и architecture diagram.
- [ ] CI обязателен для merge в `main`.
- [ ] Основные architectural decisions документированы.
- [ ] Payment demo не хранит card data.
- [ ] Money и order totals рассчитываются безопасно на backend.

---

## 20. Ошибки, которых нужно избежать

### Ошибка 1: два независимых lockfile

Нужно один раз устанавливать dependencies из root.

### Ошибка 2: импорт backend source во frontend

Связь только через API/OpenAPI client.

### Ошибка 3: общий пакет `shared` для всего подряд

Пакет быстро превращается в неуправляемую зависимость. Делать узкие packages с понятной ответственностью.

### Ошибка 4: преждевременные микросервисы

Они не усиливают portfolio, если нет реальной distributed-system задачи.

### Ошибка 5: root `.env` для всех приложений

Каждое приложение владеет своей configuration boundary.

### Ошибка 6: migrations на каждом API startup

При нескольких replicas возникает race. Нужен отдельный migration job.

### Ошибка 7: float для денег

Использовать minor units и currency.

### Ошибка 8: доверять frontend total

Backend пересчитывает заказ самостоятельно.

### Ошибка 9: десятки пустых packages

Создавать package при появлении первого consumer.

### Ошибка 10: максимальная сложность lint вместо пользы

Typed linting нужен, но rules должны находить дефекты, а не создавать сотни suppressions.

### Ошибка 11: использовать Nest CLI monorepo как верхний workspace

Top-level workspace должен управлять Next.js, NestJS и packages вместе. NestJS остаётся обычным app внутри pnpm/Turborepo.

### Ошибка 12: запускать только unit tests

Для магазина критичны реальные database transactions и full checkout flow.

---

## 21. Базовые команды разработчика

```bash
# Install
pnpm install

# Start local PostgreSQL
pnpm dev:infra

# Start web + api
pnpm dev

# Generate OpenAPI client
pnpm api:generate

# Create/apply development migration
pnpm db:migrate:dev

# Seed demo data
pnpm db:seed

# Fast quality gate
pnpm check

# Full quality gate
pnpm check:full

# Full containerized demo
docker compose -f compose.demo.yaml up --build
```

---

## 22. Рекомендуемый первый milestone

Не пытаться сразу закончить весь shop. Первый качественный milestone:

```text
1. Monorepo boots from root
2. PostgreSQL runs in Compose
3. NestJS has health endpoint
4. Product migration + seed exist
5. GET /api/v1/products works
6. Swagger/OpenAPI works
7. API client is generated
8. Next.js renders products from API
9. Unit + integration + Playwright tests pass
10. CI and both Docker builds pass
```

После этого архитектура доказана реальным vertical slice, а не только красивым деревом директорий.

---

## 23. Официальные источники

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [pnpm Installation](https://pnpm.io/installation)
- [Turborepo — Structuring a repository](https://turborepo.com/docs/crafting-your-repository/structuring-a-repository)
- [Turborepo — Docker](https://turborepo.com/docs/guides/tools/docker)
- [Turborepo — Environment variables](https://turborepo.com/docs/crafting-your-repository/using-environment-variables)
- [Next.js — Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js — Deployment](https://nextjs.org/docs/app/getting-started/deploying)
- [Next.js — Standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Next.js — ESLint](https://nextjs.org/docs/app/api-reference/config/eslint)
- [Next.js — Vitest](https://nextjs.org/docs/app/guides/testing/vitest)
- [Next.js — Playwright](https://nextjs.org/docs/app/guides/testing/playwright)
- [NestJS — First steps](https://docs.nestjs.com/first-steps)
- [NestJS — Configuration](https://docs.nestjs.com/techniques/configuration)
- [NestJS — Validation](https://docs.nestjs.com/techniques/validation)
- [NestJS — OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [NestJS — Testing](https://docs.nestjs.com/fundamentals/testing)
- [NestJS — Health checks](https://docs.nestjs.com/recipes/terminus)
- [NestJS — Prisma](https://docs.nestjs.com/recipes/prisma)
- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting)
- [Prettier and linters](https://prettier.io/docs/integrating-with-linters)
- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [GitHub Actions — Building and testing Node.js](https://docs.github.com/actions/guides/building-and-testing-nodejs)

---

## 24. Финальная рекомендация

Начать с этой минимальной структуры:

```text
apps/
├── web
├── api
└── e2e

packages/
├── api-client
├── eslint-config
└── typescript-config
```

После первого рабочего vertical slice добавить `ui` и `test-utils` только при реальном reuse.

Главный показатель качества этого проекта — не количество папок и технологий, а то, что:

```text
fresh clone
→ one install
→ one command
→ database + API + web
→ tests pass
→ Docker builds
→ architecture понятна из README
```
