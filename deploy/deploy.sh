#!/usr/bin/env bash
set -euo pipefail

# ── Bitrium Production Deploy Script ──
# Usage: ./deploy/deploy.sh [frontend|backend|all]
# Default: all

API_HOST="161.35.94.191"
REMOTE_USER="root"
REMOTE_DIST="/var/www/bitrium/dist"
REMOTE_SERVER="/root/Bitrium/server"
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

MODE="${1:-all}"

echo "═══ Bitrium Deploy ═══"
echo "Mode: $MODE"
echo ""

deploy_frontend() {
  echo "▸ Building frontend..."
  cd "$LOCAL_ROOT"
  npx vite build

  echo "▸ Cleaning old artifacts on server..."
  ssh -o ConnectTimeout=15 "${REMOTE_USER}@${API_HOST}" "rm -rf ${REMOTE_DIST}"

  echo "▸ Uploading new build..."
  scp -o ConnectTimeout=15 -r "$LOCAL_ROOT/dist" "${REMOTE_USER}@${API_HOST}:${REMOTE_DIST}"

  echo "✓ Frontend deployed"
}

deploy_backend() {
  echo "▸ Uploading backend source..."
  scp -o ConnectTimeout=15 -r "$LOCAL_ROOT/server/src" "${REMOTE_USER}@${API_HOST}:${REMOTE_SERVER}/src"

  echo "▸ Restarting PM2..."
  ssh -o ConnectTimeout=15 "${REMOTE_USER}@${API_HOST}" "cd /root/Bitrium && pm2 restart all --update-env"

  echo "✓ Backend deployed"
}

case "$MODE" in
  frontend|fe)
    deploy_frontend
    ;;
  backend|be)
    deploy_backend
    ;;
  all)
    deploy_frontend
    deploy_backend
    ;;
  *)
    echo "Usage: $0 [frontend|backend|all]"
    exit 1
    ;;
esac

echo ""
echo "═══ Deploy complete ═══"
