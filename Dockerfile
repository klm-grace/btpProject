# ═══════════════════════════════════════════════════════════════
# Dockerfile — Multi-stage build pour BTP API
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build ─────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY bun.lock ./
COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY src/libs/*/package.json ./src/libs/ 2>/dev/null || true

# Installer les dépendances
RUN bun install --frozen-lockfile --production

# Copier le code source
COPY . .

# Build du binaire
RUN bun build apps/api/index.ts \
  --outdir /app/dist \
  --target bun \
  --minify

# ── Stage 2: Production ────────────────────────────────────────
FROM oven/bun:1-alpine AS production

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
ENV CORS_ORIGINS=http://localhost:3000
ENV TRUST_PROXY=true

# Créer l'utilisateur non-root
RUN addgroup -g 1001 -S btp && \
    adduser -u 1001 -S btp -G btp

# Copier le binaire
COPY --from=builder --chown=btp:btp /app/dist /app/dist
COPY --from=builder --chown=btp:btp /app/node_modules /app/node_modules
COPY --from=builder --chown=btp:btp /app/src/libs /app/src/libs
COPY --from=builder --chown=btp:btp /app/apps/api/constants /app/apps/api/constants

# Configurer les dossiers
RUN mkdir -p /app/logs /app/data/storage && \
    chown -R btp:btp /app/logs /app/data

WORKDIR /app

USER btp

# Ports exposés
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:4000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Démarrage
ENTRYPOINT ["bun", "run", "dist/index.js"]
