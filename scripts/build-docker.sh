#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

IMAGE_NAME="${BTP_IMAGE:-btp-api}"
IMAGE_TAG="${BTP_TAG:-$(git rev-parse --short HEAD)}"

echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Build Docker — BTP Project API                   ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}▶ Image: ${IMAGE_NAME}:${IMAGE_TAG}${NC}"
echo ""

# ── Étape 1 : Tests unitaires sur l'hôte ────────────────────
echo -e "${CYAN}▶ Étape 1/2 : Tests unitaires (hôte)${NC}"
if bun test src/libs/ 2>&1; then
  echo -e "${GREEN}  ✓ Tests passés${NC}"
else
  echo -e "${RED}  ✗ Tests échoués — build annulé${NC}"
  exit 1
fi
echo ""

# ── Étape 2 : Build Docker ────────────────────────────────────
echo -e "${CYAN}▶ Étape 2/2 : Build Docker${NC}"
if docker build \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  -t "${IMAGE_NAME}:latest" \
  . 2>&1; then
  echo -e "${GREEN}  ✓ Build réussi${NC}"
else
  echo -e "${RED}  ✗ Build échoué${NC}"
  exit 1
fi
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✓ Build terminé !                                   ║${NC}"
echo -e "${GREEN}║                                                      ║${NC}"
echo -e "${GREEN}║  Démarrer : bun run docker:run                       ║${NC}"
echo -e "${GREEN}║  Push     : docker push ${IMAGE_NAME}:${IMAGE_TAG}${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
