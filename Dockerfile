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

COPY --link --from=deps /app/node_modules ./node_modules
COPY --link --from=builder /app/public ./public
COPY --link --from=builder /app/prisma ./prisma
COPY --link --from=builder /app/.next/standalone ./
COPY --link --from=builder /app/.next/static ./.next/static
COPY --link --from=deps /app/node_modules ./node_modules
EXPOSE 3000

CMD ["sh", "-lc", "if [ -z \"$DATABASE_URL\" ]; then echo 'DATABASE_URL missing in container env'; exit 1; fi; node node_modules/prisma/build/index.js migrate deploy --schema=/app/prisma/schema.prisma && node server.js"]
