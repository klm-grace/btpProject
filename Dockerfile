# ═══════════════════════════════════════════════════════════════
# Dockerfile — Multi-stage build pour BTP API
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build + Tests ─────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY bun.lock ./
COPY package.json ./

# Installer les dépendances
RUN bun install --frozen-lockfile

# Copier le code source
COPY src/ ./src/
COPY apps/ ./apps/
COPY test/ ./test/
COPY migrations/ ./migrations/
COPY seeds/ ./seeds/
COPY tsconfig.json ./

# Nettoyer les fichiers temporaires de test
RUN rm -rf /tmp/btp-test-storage /tmp/btp-storage-test

# Lancer les tests DANS Docker
RUN bun test src/libs/ 2>&1 && \
    bun test test/api/pentest-full.test.ts 2>&1 && \
    bun test test/api/security-events.test.ts test/api/leads.test.ts test/api/content.test.ts test/api/portfolio.test.ts 2>&1

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

# Copier uniquement le binaire et les dépendances
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
