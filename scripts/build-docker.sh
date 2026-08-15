#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# BUILD DOCKER — Tests internes + Build production
# Les tests Bruno sont exécutés À L'EXTÉRIEUR (sur la machine hôte)
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

IMAGE_NAME="${BTP_IMAGE:-btp-api}"
IMAGE_TAG="${BTP_TAG:-$(git rev-parse --short HEAD)}"

echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Build Docker — BTP Project API                  ║${NC}"
echo -e "${CYAN}║     (Tests internes Docker + Tests Bruno externe)    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}▶ Image: ${IMAGE_NAME}:${IMAGE_TAG}${NC}"
echo ""

# ── Étape 1 : Tests Bruno (EXTÉRIEUR - sur la machine hôte) ────
echo -e "${CYAN}▶ Étape 1/3 : Tests Bruno (externe)${NC}"
if [ -d "bruno/collections" ] && command -v bun &>/dev/null; then
  # Démarrer le serveur pour les tests Bruno
  echo "  Démarrage du serveur pour tests Bruno..."
  PORT=4000 bun run apps/api/index.ts &
  SERVER_PID=$!
  
  # Attendre que le serveur soit prêt
  for i in $(seq 1 10); do
    if curl -s http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
      echo "  ✓ Serveur prêt (PID: $SERVER_PID)"
      break
    fi
    sleep 1
  done
  
  # Exécuter les tests Bruno avec le MCP ou script équivalent
  if [ -f "scripts/run-bruno-equivalent.mjs" ]; then
    echo "  Exécution des tests Bruno..."
    if bun run scripts/run-bruno-equivalent.mjs 2>&1; then
      echo -e "${GREEN}  ✓ Tests Bruno passés${NC}"
    else
      echo -e "${YELLOW}  ⚠ Certains tests Bruno ont échoué (continuation)${NC}"
    fi
  else
    echo "  - Aucun script Bruno trouvé (tests manuels requis)"
  fi
  
  # Arrêter le serveur
  kill $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
else
  echo -e "${YELLOW}  ⚠ Bruno non configuré (tests manuels requis)${NC}"
fi
echo ""

# ── Étape 2 : Build Docker (tests internes) ────────────────────
echo -e "${CYAN}▶ Étape 2/3 : Build Docker (tests internes)${NC}"

if docker build \
  --build-arg BUN_VERSION="${BUN_VERSION:-1.3.14}" \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  -t "${IMAGE_NAME}:latest" \
  . 2>&1; then
  echo -e "${GREEN}  ✓ Build Docker réussi${NC}"
else
  echo -e "${RED}  ✗ Build Docker échoué${NC}"
  exit 1
fi
echo ""

# ── Étape 3 : Cleanup ──────────────────────────────────────────
echo -e "${CYAN}▶ Étape 3/3 : Nettoyage${NC}"
# Docker supprime automatiquement les couches intermédiaires
# On nettoie les fichiers temporaires locaux
rm -rf /tmp/btp-test-storage /tmp/btp-storage-test 2>/dev/null || true
echo -e "${GREEN}  ✓ Nettoyage terminé${NC}"
echo ""

# ── Résumé ─────────────────────────────────────────────────────
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✓ Build Docker terminé!                            ║${NC}"
echo -e "${GREEN}║                                                     ║${NC}"
echo -e "${GREEN}║  Pour démarrer:${NC}"
echo -e "${GREEN}║    docker run -p 4000:4000 --env-file .env ${IMAGE_NAME}:${IMAGE_TAG}${NC}"
echo -e "${GREEN}║                                                     ║${NC}"
echo -e "${GREEN}║  Pour push:${NC}"
echo -e "${GREEN}║    docker push ${IMAGE_NAME}:${IMAGE_TAG}${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
