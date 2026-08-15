#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# START PRODUCTION — Démarrage du serveur binaire
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Démarrage Production — BTP API                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Vérifications ──────────────────────────────────────────────
if [ ! -f "dist/index.js" ]; then
  echo -e "${RED}✗ Build non trouvé. Lancez './scripts/build.sh' d'abord.${NC}"
  exit 1
fi

# Vérifier les variables d'environnement requises
REQUIRED_VARS=("PORT" "DB_URL" "REDIS_URL" "SESSION_SECRET" "CORS_ORIGINS")
MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ] && [ -z "${BTP_$var:-}" ]; then
    echo -e "${YELLOW}  ⚠ $var non défini (utilisation de la valeur par défaut)${NC}"
    MISSING=$((MISSING + 1))
  fi
done

if [ "$MISSING" -gt 0 ]; then
  echo -e "${YELLOW}  $MISSING variable(s) d'environnement manquante(s)${NC}"
  echo ""
  echo "  Copiez .env.example vers .env et remplissez les valeurs :"
  echo "    cp .env.example .env"
  echo ""
fi

# ── Vérification infrastructure ────────────────────────────────
echo -e "${CYAN}▶ Vérification infrastructure${NC}"

if command -v docker &>/dev/null && docker compose ps --format json 2>/dev/null | grep -q "running"; then
  echo -e "${GREEN}  ✓ PostgreSQL + Redis en cours d'exécution${NC}"
else
  # Vérifier si les services sont accessibles
  if curl -s --max-time 2 http://localhost:5432 >/dev/null 2>&1 || \
     grep -q "postgres" docker-compose.yml 2>/dev/null; then
    echo -e "${YELLOW}  ⚠ PostgreSQL non détecté sur le port 5432${NC}"
  fi
  if curl -s --max-time 2 redis://localhost:6379 >/dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Redis accessible${NC}"
  else
    echo -e "${YELLOW}  ⚠ Redis non détecté sur le port 6379${NC}"
  fi
fi

# ── Migration DB ───────────────────────────────────────────────
echo ""
echo -e "${CYAN}▶ Migration de la base de données${NC}"
if [ -n "${SKIP_MIGRATION:-}" ]; then
  echo -e "${YELLOW}  Skip migration (SKIP_MIGRATION=1)${NC}"
else
  if bun run db:migrate 2>&1; then
    echo -e "${GREEN}  ✓ Migrations appliquées${NC}"
  else
    echo -e "${YELLOW}  ⚠ Échec des migrations (continuation possible)${NC}"
  fi
fi

# ── Seed (optionnel) ──────────────────────────────────────────
if [ -n "${RUN_SEED:-}" ]; then
  echo ""
  echo -e "${CYAN}▶ Seed de la base de données${NC}"
  bun run db:seed 2>&1 || echo -e "${YELLOW}  ⚠ Seed échoué${NC}"
fi

# ── Démarrage ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}▶ Démarrage du serveur${NC}"
echo ""

# Nettoyer les logs anciens
LOG_FILE="logs/api-$(date +%Y%m%d).log"
mkdir -p logs
echo "  Logs: $LOG_FILE"
echo ""

# Démarrer le serveur
if [ -n "${DAEMON:-}" ]; then
  # Mode daemon (arrière-plan)
  nohup bun run dist/index.js > "$LOG_FILE" 2>&1 &
  PID=$!
  echo -e "${GREEN}  ✓ Serveur démarré en arrière-plan (PID: $PID)${NC}"
  echo "  Logs: tail -f $LOG_FILE"
else
  # Mode foreground (attaché au terminal)
  echo -e "${CYAN}  Appuyez Ctrl+C pour arrêter${NC}"
  echo ""
  exec bun run dist/index.js
fi
