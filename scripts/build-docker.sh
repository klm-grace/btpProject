#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# BUILD DOCKER — Build multi-stage pour production
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
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}▶ Image: ${IMAGE_NAME}:${IMAGE_TAG}${NC}"
echo ""

# ── Build multi-stage ──────────────────────────────────────────
echo -e "${CYAN}▶ Build Docker${NC}"

if docker build \
  --build-arg BUN_VERSION="${BUN_VERSION:-1.3.14}" \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  -t "${IMAGE_NAME}:latest" \
  . 2>&1; then
  echo ""
  echo -e "${GREEN}✓ Build Docker réussi${NC}"
  echo ""
  echo -e "${CYAN}  Images créées:${NC}"
  docker images "${IMAGE_NAME}" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  Pour démarrer:${NC}"
  echo -e "${GREEN}║    docker run -p 4000:4000 ${IMAGE_NAME}:${IMAGE_TAG}${NC}"
  echo -e "${GREEN}║                                                     ║${NC}"
  echo -e "${GREEN}║  Pour push:${NC}"
  echo -e "${GREEN}║    docker push ${IMAGE_NAME}:${IMAGE_TAG}${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
else
  echo -e "${RED}✗ Build Docker échoué${NC}"
  exit 1
fi
