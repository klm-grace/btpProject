#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# DOCKER:RUN — Démarrage ordonné : VictoriaLogs → deps → API → Nginx
# Si VL ne démarre pas → warning, l'API continue avec fallback disque
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Docker Run — BTP Project (Nginx + VictoriaLogs)    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── 0. Certificats TLS (auto-signés si absents) ─────────────────────────
echo -e "${CYAN}▶ Vérification des certificats TLS...${NC}"
bash "$SCRIPT_DIR/generate-certs.sh"

# ── 1. Démarrer VictoriaLogs ─────────────────────────────────────────────
echo -e "${CYAN}▶ Démarrage de VictoriaLogs...${NC}"
docker compose up -d victorialogs 2>/dev/null || {
  echo -e "${YELLOW}  ⚠ docker compose up échoué (VL non démarré)${NC}"
  VL_OK=false
}

echo -e "${CYAN}  ⏳ Attente de VictoriaLogs (max 60s)...${NC}"
VL_OK=false
for i in $(seq 1 30); do
  # VictoriaLogs est un binaire Go sans shell → check via curl hôte
  if curl -s -f http://localhost:9428/health >/dev/null 2>&1; then
    VL_OK=true
    echo -e "${GREEN}  ✓ VictoriaLogs healthy (étape $i/30)${NC}"
    break
  fi
  echo "  étape $i/30..."
  if [ "$i" -eq 30 ]; then
    echo -e "${YELLOW}  ⚠ VictoriaLogs pas reachable après 60s${NC}"
  fi
  sleep 2
done
echo ""

# ── 2. Démarrer PostgreSQL et Redis ──────────────────────────────────────
echo -e "${CYAN}▶ Démarrage des dépendances...${NC}"
docker compose up -d postgres redis 2>/dev/null || {
  echo -e "${YELLOW}  ⚠ Certains services n'ont pas démarré${NC}"
}

echo -e "${CYAN}  ⏳ Attente de PostgreSQL et Redis...${NC}"
for svc in postgres redis; do
  for i in $(seq 1 20); do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "btp-$svc" 2>/dev/null || echo "not_found")
    if [ "$STATUS" = "healthy" ]; then
      echo -e "${GREEN}  ✓ $svc healthy${NC}"
      break
    fi
    if [ "$i" -eq 20 ]; then
      echo -e "${YELLOW}  ⚠ $svc pas healthy (l'API continuera)${NC}"
    fi
    sleep 1
  done
done
echo ""

# ── 3. Démarrer l'API ───────────────────────────────────────────────────
echo -e "${CYAN}▶ Démarrage de l'API${NC}"
docker compose up -d api 2>/dev/null || {
  echo -e "${RED}  ✗ Échec du démarrage de l'API${NC}"
  exit 1
}

# ── 4. Démarrer Nginx (reverse proxy) ───────────────────────────────────
echo -e "${CYAN}▶ Démarrage de Nginx${NC}"
docker compose up -d nginx 2>/dev/null || {
  echo -e "${RED}  ✗ Échec du démarrage de Nginx${NC}"
  exit 1
}

# ── 5. Attendre que l'API soit prête (via Nginx) ────────────────────────
# Détection du mode TLS actif (https = redirection, sinon http direct)
echo -e "${CYAN}  ⏳ Attente de l'API via Nginx...${NC}"
TLS_MODE="$(bash "$SCRIPT_DIR/nginx-tls.sh" status 2>/dev/null | grep -oE 'https|http' | head -1 || echo http)"
API_BASE="http://localhost"
if [ "$TLS_MODE" = "https" ]; then
  API_BASE="https://localhost"
fi
for i in $(seq 1 20); do
  if curl -sk "$API_BASE/api/ready" >/dev/null 2>&1; then
    echo -e "${GREEN}  ✓ API prête (étape $i/20) — $API_BASE${NC}"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo -e "${YELLOW}  ⚠ API non prête après 20s${NC}"
  fi
  sleep 1
done
echo ""

# ── 6. Résumé ───────────────────────────────────────────────────────────
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✓ Docker run terminé                                ║${NC}"
echo -e "${GREEN}║                                                      ║${NC}"
echo -e "${GREEN}║  API (via Nginx) : ${API_BASE}                      ║${NC}"
echo -e "${GREEN}║  VictoriaLogs    : http://localhost:9428             ║${NC}"
if [ "$VL_OK" = true ]; then
  echo -e "${GREEN}║  VictoriaLogs : ✅ actif (logs envoyés)             ║${NC}"
else
  echo -e "${YELLOW}║  VictoriaLogs : ⚠ indisponible (fallback disque)    ║${NC}"
fi
echo -e "${GREEN}║                                                      ║${NC}"
echo -e "${GREEN}║  Arrêter : docker compose stop                       ║${NC}"
echo -e "${GREEN}║  Logs API : docker compose logs -f api               ║${NC}"
echo -e "${GREEN}║  Logs Nginx: docker compose logs -f nginx            ║${NC}"
echo -e "${GREEN}║  Logs VL  : docker compose logs -f victorialogs      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"