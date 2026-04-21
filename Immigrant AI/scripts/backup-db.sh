#!/usr/bin/env bash
# Immigrant Guru — Postgres backup
# Runs on the production droplet via cron. Keeps 7 daily dumps locally.
#
# Install (on server):
#   sudo mkdir -p /var/backups/immigrant && sudo chown postgres:postgres /var/backups/immigrant
#   sudo cp /opt/app/immigrant-guru/scripts/backup-db.sh /usr/local/bin/immigrant-backup
#   sudo chmod +x /usr/local/bin/immigrant-backup
#   sudo crontab -e
#     # Daily at 03:15 UTC
#     15 3 * * * /usr/local/bin/immigrant-backup >> /var/log/immigrant/backup.log 2>&1

set -euo pipefail

BACKUP_DIR="/var/backups/immigrant"
KEEP_DAYS=7
DB_NAME="immigrant_ai"
DB_USER="immigrant_ai"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/immigrant_ai-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump as the postgres superuser via peer auth, compress on the fly.
sudo -u postgres pg_dump -Fc "$DB_NAME" | gzip -9 > "$OUT"

echo "[$(date -u +%FT%TZ)] backup ok: $OUT ($(du -h "$OUT" | cut -f1))"

# Rotate: delete dumps older than KEEP_DAYS.
find "$BACKUP_DIR" -name 'immigrant_ai-*.sql.gz' -type f -mtime "+$KEEP_DAYS" -print -delete

# Optional: push to DO Spaces if s3cmd is configured (~/.s3cfg).
if command -v s3cmd >/dev/null 2>&1 && [ -f /root/.s3cfg ]; then
  BUCKET="${BACKUP_S3_BUCKET:-}"
  if [ -n "$BUCKET" ]; then
    s3cmd put "$OUT" "s3://$BUCKET/db-backups/" --acl-private >/dev/null
    echo "[$(date -u +%FT%TZ)] uploaded to s3://$BUCKET/db-backups/"
  fi
fi
