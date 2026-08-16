#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# STOP ELK — Arrêt du stack ELK
# ═══════════════════════════════════════════════════════════════

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}▶ Arrêt du stack ELK${NC}"
docker compose stop elasticsearch logstash kibana 2>/dev/null || true
docker compose rm -f elasticsearch logstash kibana 2>/dev/null || true
echo -e "${GREEN}  ✓ ELK arrêté${NC}"
