#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# START PROD DOCKER — Démarrage de l'API uniquement
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Production Docker — BTP API                      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Démarrer l'API ─────────────────────────────────────────
echo -e "${CYAN}▶ Démarrage de l'API${NC}"
docker rm -f btp-api 2>/dev/null || true
docker run -d \
  --name btp-api \
  --network btp-internal \
  -p 4000:4000 \
  --env-file .env \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e DATABASE_URL=postgres://btp_dev:btp_dev_password@postgres:5432/btp_dev \
  -e REDIS_URL=redis://:btp_dev_redis_password@redis:6379 \
  -v "$(pwd)/logs:/app/logs:rw" \
  -v "$(pwd)/logs-backup:/app/logs/backup:rw" \
  btp-api:latest >/dev/null

echo -e "${GREEN}  ✓ API démarrée : http://localhost:4000${NC}"
echo ""

# ── Attendre que l'API soit prête ──────────────────────────
echo -e "${CYAN}  ⏳ Attente de l'API...${NC}"
for i in $(seq 1 20); do
  if curl -s http://localhost:4000/api/ready >/dev/null 2>&1; then
    echo -e "${GREEN}  ✓ API prête (étape $i/20)${NC}"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo -e "${YELLOW}  ⚠ API non prête après 20s${NC}"
  fi
  sleep 2
done
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✓ Production démarrée !                             ║${NC}"
echo -e "${GREEN}║                                                      ║${NC}"
echo -e "${GREEN}║  API        : http://localhost:4000                  ║${NC}"
echo -e "${GREEN}║  Arrêter API : docker rm -f btp-api                  ║${NC}"
echo -e "${GREEN}║  Arrêter tout: docker compose down                   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
