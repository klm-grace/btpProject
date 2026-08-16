#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Génère un certificat TLS auto-signé pour Nginx (dev/test).
# En production : remplacez /config/nginx/certs/server.crt|key
# par de vrais certificats (Let's Encrypt, CA, etc.).
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/../config/nginx/certs"

mkdir -p "$CERTS_DIR"

if [[ -f "$CERTS_DIR/server.crt" && -f "$CERTS_DIR/server.key" ]]; then
  echo "✓ Certificats déjà présents : $CERTS_DIR"
  exit 0
fi

echo "▶ Génération d'un certificat auto-signé (1 an)..."

# SAN : localhost + IPs locales courantes
openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 365 \
  -keyout "$CERTS_DIR/server.key" \
  -out "$CERTS_DIR/server.crt" \
  -subj "/CN=btp.local" \
  -addext "subjectAltName=DNS:localhost,DNS:btp.local,IP:127.0.0.1,IP:192.168.122.20,IP:169.254.247.148"

chmod 600 "$CERTS_DIR/server.key"

echo "✓ Certificats générés :"
echo "  Cert : $CERTS_DIR/server.crt"
echo "  Key  : $CERTS_DIR/server.key"