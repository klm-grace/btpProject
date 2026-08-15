#!/usr/bin/env bash
# Collecteur de logs — Sauvegarde externe des logs API
# À exécuter régulièrement via cron

set -euo pipefail

LOG_SRC="${LOG_DIR:-./logs}"
LOG_DST="${BACKUP_DIR:-./logs-backup}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Créer le dossier de backup
mkdir -p "$LOG_DST"

# Copier les logs existants
if [ -d "$LOG_SRC" ]; then
  cp -r "$LOG_SRC"/*.log "$LOG_DST/" 2>/dev/null || true
  echo "[$TIMESTAMP] Logs sauvegardés vers $LOG_DST/"
else
  echo "[$TIMESTAMP] Aucun log trouvé dans $LOG_SRC"
fi

# Rotation des backups (garder 7 jours)
find "$LOG_DST" -name "*.log" -mtime +7 -delete 2>/dev/null || true
