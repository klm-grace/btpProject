#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# START ELK — Démarrage à la demande du stack ELK
# ELK ne démarre pas automatiquement, appelé manuellement ici
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}▶ Démarrage ELK (à la demande)${NC}"

docker compose up -d elasticsearch logstash kibana
echo -e "${GREEN}  ✓ ELK démarré${NC}"

echo -e "${CYAN}  ⏳ Attente d'Elasticsearch...${NC}"
for i in $(seq 1 30); do
  if docker inspect --format='{{.State.Health.Status}}' btp-elasticsearch 2>/dev/null | grep -q "healthy"; then
    echo -e "${GREEN}  ✓ Elasticsearch healthy (étape $i/30)${NC}"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo -e "${YELLOW}  ⚠ Elasticsearch non healthy après 30s${NC}"
  fi
  sleep 2
done

echo -e "${GREEN}  ✓ Kibana      : http://localhost:5601${NC}"
echo -e "${GREEN}  ✓ Elasticsearch: http://localhost:9200${NC}"
echo -e "${GREEN}  ✓ Logstash    : port 5044${NC}"
echo -e "${GREEN}    User/Pass   : elastic / ${ELASTIC_PASSWORD:-btp-elastic-2026!}${NC}"
echo ""
