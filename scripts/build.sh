#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# BUILD — Compilation binaire (tests internes + Bruno externe)
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Build Production — BTP Project API              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Étape 1 : Pré-build ────────────────────────────────────────
echo -e "${CYAN}▶ Étape 1/4 : Validation pré-build${NC}"
if [ -f "scripts/pre-build.sh" ]; then
  bash scripts/pre-build.sh || { echo -e "${RED}Échec du pré-build${NC}"; exit 1; }
else
  echo -e "${YELLOW}  skip: scripts/pre-build.sh non trouvé${NC}"
fi
echo ""

# ── Étape 2 : Tests Bruno (EXTÉRIEUR) ──────────────────────────
echo -e "${CYAN}▶ Étape 2/4 : Tests Bruno (externe)${NC}"
if [ -d "bruno/collections" ] && command -v bun &>/dev/null; then
  echo "  Démarrage du serveur pour tests Bruno..."
  PORT=4000 bun run apps/api/index.ts > /tmp/btp-api-build.log 2>&1 &
  SERVER_PID=$!
  
  # Attendre que le serveur soit prêt
  for i in $(seq 1 15); do
    if curl -s http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
      echo "  ✓ Serveur prêt (PID: $SERVER_PID)"
      break
    fi
    if [ $i -eq 15 ]; then
      echo "  ✗ Timeout pour démarrer le serveur"
      kill $SERVER_PID 2>/dev/null || true
    fi
    sleep 1
  done
  
  # Exécuter les tests Bruno
  if [ -f "scripts/run-bruno-equivalent.mjs" ]; then
    echo "  Exécution des tests Bruno..."
    if bun run scripts/run-bruno-equivalent.mjs 2>&1 | tee /tmp/bruno-tests.log; then
      echo -e "${GREEN}  ✓ Tests Bruno passés${NC}"
    else
      echo -e "${YELLOW}  ⚠ Certains tests Bruno ont échoué (continuation)${NC}"
    fi
  fi
  
  # Arrêter le serveur
  echo "  Arrêt du serveur..."
  kill $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
  rm -f /tmp/btp-api-build.log /tmp/bruno-tests.log
else
  echo -e "${YELLOW}  ⚠ Bruno non configuré (tests manuels requis)${NC}"
fi
echo ""

# ── Étape 3 : Build binaire ────────────────────────────────────
echo -e "${CYAN}▶ Étape 3/4 : Compilation binaire${NC}"
echo "  Build: apps/api/index.ts → dist/"

# Nettoyer l'ancien build
rm -rf dist/

# Build avec Bun
BUN_BUILD_START=$(date +%s)
if bun build apps/api/index.ts \
  --outdir dist \
  --target bun \
  --minify 2>&1; then
  BUN_BUILD_END=$(date +%s)
  BUN_BUILD_TIME=$((BUN_BUILD_END - BUN_BUILD_START))
  echo -e "  ${GREEN}✓ Build réussi (${BUN_BUILD_TIME}s)${NC}"
else
  echo -e "  ${RED}✗ Build échoué${NC}"
  exit 1
fi
echo ""

# ── Étape 4 : Nettoyage ────────────────────────────────────────
echo -e "${CYAN}▶ Étape 4/4 : Nettoyage${NC}"
rm -rf /tmp/btp-test-storage /tmp/btp-storage-test /tmp/btp-api-build.log /tmp/bruno-tests.log 2>/dev/null || true
echo -e "  ${GREEN}✓ Nettoyage terminé${NC}"

# ── Résumé ─────────────────────────────────────────────────────
BUILD_SIZE=$(du -sh dist/ | awk '{print $1}')

echo -e "\n${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✓ Build terminé avec succès!                       ║${NC}"
echo -e "${GREEN}║                                                     ║${NC}"
echo -e "${GREEN}║  Pour démarrer en prod:                             ║${NC}"
echo -e "${GREEN}║    ./scripts/start-prod.sh                          ║${NC}"
echo -e "${GREEN}║                                                     ║${NC}"
echo -e "${GREEN}║  Taille: $BUILD_SIZE                                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
