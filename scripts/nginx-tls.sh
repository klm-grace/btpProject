#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Nginx TLS — Activer/désactiver le certificat chez Nginx
#
#   scripts/nginx-tls.sh on    → HTTPS actif (redirection HTTP→HTTPS)
#   scripts/nginx-tls.sh off   → HTTP seul (pas de certificat requis)
#   scripts/nginx-tls.sh status→ mode actuel
#
# Utile quand on contacte le serveur par IP sans configurer le
# certificat côté client : HTTP direct, sans warning.
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONF_DIR="$PROJECT_DIR/config/nginx/conf.d"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ACTIVE_FILE="$CONF_DIR/api.conf"
HTTPS_FILE="$CONF_DIR/api-https.template"
HTTP_FILE="$CONF_DIR/api-http.template"

current_mode() {
  if cmp -s "$ACTIVE_FILE" "$HTTPS_FILE"; then
    echo "https"
  elif cmp -s "$ACTIVE_FILE" "$HTTP_FILE"; then
    echo "http"
  else
    echo "unknown"
  fi
}

apply_and_reload() {
  local src="$1"
  local mode="$2"

  cp "$src" "$ACTIVE_FILE"

  # Valide la config dans le conteneur avant de recharger
  if ! docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T nginx nginx -t >/dev/null 2>&1; then
    echo -e "${RED}✗ Configuration invalide, restauration...${NC}"
    # Restaure le mode précédent
    if [ "$mode" = "https" ]; then
      cp "$HTTP_FILE" "$ACTIVE_FILE"
    else
      cp "$HTTPS_FILE" "$ACTIVE_FILE"
    fi
    docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T nginx nginx -t
    exit 1
  fi

  docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T nginx nginx -s reload
  echo -e "${GREEN}✓ TLS $mode — nginx rechargé${NC}"
}

case "${1:-}" in
  on)
    echo -e "${CYAN}▶ Activation HTTPS...${NC}"
    apply_and_reload "$HTTPS_FILE" "https"
    echo -e "${GREEN}  API : https://localhost ou https://<IP>${NC}"
    ;;
  off)
    echo -e "${CYAN}▶ Désactivation TLS (HTTP seul)...${NC}"
    apply_and_reload "$HTTP_FILE" "http"
    echo -e "${GREEN}  API : http://<IP>${NC}"
    ;;
  status)
    echo -e "Mode actuel : ${CYAN}$(current_mode)${NC}"
    ;;
  *)
    echo "Usage: $0 {on|off|status}"
    echo "  on    → HTTPS actif"
    echo "  off   → HTTP seul (sans certificat)"
    echo "  status→ mode actuel"
    exit 1
    ;;
esac