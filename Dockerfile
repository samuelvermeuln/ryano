# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --fund=false

# Prisma CLI only, installed standalone. The runtime needs it solely for
# `migrate deploy` in CMD; everything else comes from the traced standalone
# output, so we avoid shipping the full dependency tree.
FROM base AS prisma-cli

COPY package.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm install --prefix /prisma-cli --no-save --ignore-scripts --no-audit --fund=false \
  "prisma@$(node -p "const p=require('./package.json');p.dependencies.prisma??p.devDependencies.prisma")"

FROM base AS builder

COPY --link --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm run db:generate

COPY . .
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM base AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone already carries the traced runtime dependencies (next, react,
# @prisma/client, sharp, ...). The Prisma CLI lives outside it, under
# /prisma-cli, so it never shadows the traced tree.
COPY --link --from=builder /app/.next/standalone ./
COPY --link --from=builder /app/.next/static ./.next/static
COPY --link --from=builder /app/public ./public
COPY --link --from=builder /app/prisma ./prisma
COPY --link --from=prisma-cli /prisma-cli/node_modules /prisma-cli/node_modules
EXPOSE 3000

CMD ["sh", "-lc", "if [ -z \"$DATABASE_URL\" ]; then echo 'DATABASE_URL missing in container env'; exit 1; fi; node /prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema=/app/prisma/schema.prisma && node server.js"]
