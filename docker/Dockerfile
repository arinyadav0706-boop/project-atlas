# Multi-stage build targeting Next.js `output: "standalone"` (next.config.mjs).
# This is the portability contract from ADR-0004 — the same image runs
# locally via docker-compose and, unmodified, on Azure later.

FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Prisma CLI + engines so the entrypoint can run `migrate deploy` at
# startup — this is what makes the image self-setting-up against an empty
# database (docs/06_Infrastructure/02_Self_Hosted_Client_Lifecycle.md §4).
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=nextjs:nodejs docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENTRYPOINT ["./entrypoint.sh"]
