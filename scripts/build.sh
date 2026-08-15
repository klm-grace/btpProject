#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# BUILD — Compilation binaire Bun
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
echo -e "${CYAN}▶ Étape 1/3 : Validation pré-build${NC}"
if [ -f "scripts/pre-build.sh" ]; then
  bash scripts/pre-build.sh || { echo -e "${RED}Échec du pré-build${NC}"; exit 1; }
else
  echo -e "${YELLOW}  skip: scripts/pre-build.sh non trouvé${NC}"
fi
echo ""

# ── Étape 2 : Build binaire ────────────────────────────────────
echo -e "${CYAN}▶ Étape 2/3 : Compilation binaire${NC}"
echo "  Build: apps/api/index.ts → dist/api"

# Nettoyer l'ancien build
rm -rf dist/

# Build avec Bun
BUN_BUILD_START=$(date +%s)
if bun build apps/api/index.ts \
  --outdir dist \
  --target bun \
  --minify \
  --external "node:*" 2>&1; then
  BUN_BUILD_END=$(date +%s)
  BUN_BUILD_TIME=$((BUN_BUILD_END - BUN_BUILD_START))
  echo -e "  ${GREEN}✓ Build réussi (${BUN_BUILD_TIME}s)${NC}"
else
  echo -e "  ${RED}✗ Build échoué${NC}"
  exit 1
fi
echo ""

# ── Étape 3 : Vérification du binaire ──────────────────────────
echo -e "${CYAN}▶ Étape 3/3 : Vérification du binaire${NC}"

if [ ! -f "dist/index.js" ]; then
  echo -e "  ${RED}✗ dist/index.js non trouvé${NC}"
  exit 1
fi

# Vérifier la taille
BUILD_SIZE=$(du -sh dist/ | awk '{print $1}')
echo "  Taille du build: $BUILD_SIZE"

# Vérifier que c'est un binaire exécutable
if [ -x "dist/index.js" ] || head -1 dist/index.js | grep -q "#!/"; then
  echo -e "  ${GREEN}✓ Binaire exécutable${NC}"
else
  echo -e "  ${YELLOW}  Note: le binaire nécessite 'bun dist/index.js' pour démarrer${NC}"
fi

# Lister le contenu
echo ""
echo "  Contenu de dist/:"
ls -la dist/ | sed 's/^/    /'

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✓ Build terminé avec succès!                       ║${NC}"
echo -e "${GREEN}║                                                     ║${NC}"
echo -e "${GREEN}║  Pour démarrer en prod:                             ║${NC}"
echo -e "${GREEN}║    ./scripts/start-prod.sh                          ║${NC}"
echo -e "${GREEN}║                                                     ║${NC}"
echo -e "${GREEN}║  Taille: $BUILD_SIZE                                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
