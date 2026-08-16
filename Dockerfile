# ═══════════════════════════════════════════════════════════════
# Dockerfile — Build binaire unique (bun build)
# Les tests unitaires s'exécutent sur l'hôte avant le build
# ═══════════════════════════════════════════════════════════════

FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY bun.lock ./
COPY package.json ./
RUN bun install --frozen-lockfile

COPY src/ ./src/
COPY apps/ ./apps/
COPY tsconfig.json ./

# Build en un seul fichier JS
RUN bun build apps/api/index.ts \
  --outdir /app/dist \
  --target bun \
  --minify

# ── Production ─────────────────────────────────────────────────
FROM oven/bun:1-alpine AS production

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

RUN addgroup -g 1001 -S btp && \
    adduser -u 1001 -S btp -G btp

COPY --from=builder --chown=btp:btp /app/dist /app/dist

RUN mkdir -p /app/logs /app/data/storage && \
    chown -R btp:btp /app/logs /app/data

WORKDIR /app
USER btp

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:4000/api/ready').then(r => r.ok ? process.exit(0) : process.exit(1))"

ENTRYPOINT ["bun", "run", "dist/index.js"]
