# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.19.0-bookworm-slim

FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PRISMA_SKIP_POSTINSTALL_GENERATE=true

RUN corepack enable \
    && corepack prepare pnpm@11.10.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

FROM base AS dependencies

RUN --mount=type=cache,id=extraok-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @extraok/api...

FROM dependencies AS build

COPY apps/api apps/api

# Prisma config validates DATABASE_URL while generating, but generation never
# connects to this placeholder database.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build

RUN pnpm --filter @extraok/api build

FROM build AS migrate

ENV NODE_ENV=production

USER node

CMD ["pnpm", "--dir", "apps/api", "exec", "prisma", "migrate", "deploy"]

FROM base AS production-dependencies

RUN --mount=type=cache,id=extraok-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @extraok/api...

FROM ${NODE_IMAGE} AS runner

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3333 \
    NODE_OPTIONS=--enable-source-maps

WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma/migrations ./apps/api/prisma/migrations
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json

USER node

EXPOSE 3333

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3333/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
