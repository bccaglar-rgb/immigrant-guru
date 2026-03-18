#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Bitrium — Production Setup Script (Faz 1-3)
# Fresh DigitalOcean Ubuntu 22.04 / 24.04 Droplet
#
# Kurulum:
#   git clone https://github.com/bccaglar-rgb/Bitrium.git /root/Bitrium
#   cd /root/Bitrium && bash deploy/setup.sh
# ──────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/root/Bitrium"
WEB_DIR="/var/www/bitrium"

echo ""
echo "════════════════════════════════════════"
echo "  Bitrium Production Setup"
echo "════════════════════════════════════════"

# ── 1. Sistem güncellemesi ─────────────────────────────────────
echo "[1/12] Sistem güncelleniyor..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git build-essential ufw

# ── 2. Node.js 22 ─────────────────────────────────────────────
echo "[2/12] Node.js 22 kuruluyor..."
if ! command -v node &>/dev/null || [[ "$(node --version)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "  Node: $(node --version)"
npm install -g pm2
echo "  PM2: $(pm2 --version)"

# ── 3. PostgreSQL 16 + TimescaleDB ────────────────────────────
echo "[3/12] PostgreSQL 16 + TimescaleDB kuruluyor..."
if ! command -v psql &>/dev/null; then
  apt-get install -y postgresql-16 postgresql-contrib-16
fi

# TimescaleDB repository
echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -cs) main" \
  > /etc/apt/sources.list.d/timescaledb.list
curl -fsSL https://packagecloud.io/timescale/timescaledb/gpgkey | apt-key add - 2>/dev/null
apt-get update -y
apt-get install -y "timescaledb-2-$(apt-cache show postgresql-16 2>/dev/null | grep -oP 'Depends: postgresql-\K[0-9]+' | head -1 | xargs -I{} echo postgresql-{})" 2>/dev/null \
  || apt-get install -y timescaledb-2-postgresql-16 || true

# TimescaleDB shared library
PG_CONF_DIR=$(find /etc/postgresql -name "postgresql.conf" 2>/dev/null | head -1 | xargs dirname || echo "")
if [ -n "$PG_CONF_DIR" ]; then
  # Add TimescaleDB to shared_preload_libraries if not already there
  if ! grep -q "timescaledb" "$PG_CONF_DIR/postgresql.conf"; then
    echo "shared_preload_libraries = 'timescaledb'" >> "$PG_CONF_DIR/postgresql.conf"
  fi
  # Performance tuning (8 GB droplet)
  mkdir -p "$PG_CONF_DIR/conf.d"
  cat > "$PG_CONF_DIR/conf.d/bitrium.conf" <<PGCONF
# Bitrium tuning
shared_buffers = 512MB
effective_cache_size = 1536MB
work_mem = 8MB
maintenance_work_mem = 128MB
max_connections = 200
wal_buffers = 16MB
checkpoint_completion_target = 0.9
random_page_cost = 1.1
PGCONF
  echo "include_dir = 'conf.d'" >> "$PG_CONF_DIR/postgresql.conf" 2>/dev/null || true
fi

systemctl enable postgresql
systemctl restart postgresql
echo "  PostgreSQL hazır"

# ── 4. DB kullanıcı ve veritabanı ────────────────────────────
echo "[4/12] DB kullanıcı ve veritabanı oluşturuluyor..."
read -rsp "PostgreSQL şifresi girin (boş bırak = otomatik üret): " DB_PASSWORD
echo ""
DB_PASSWORD=${DB_PASSWORD:-$(openssl rand -hex 16)}

sudo -u postgres psql <<SQL 2>/dev/null || true
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bitrium') THEN
    CREATE USER bitrium WITH PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER USER bitrium WITH PASSWORD '${DB_PASSWORD}';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -c "CREATE DATABASE bitrium OWNER bitrium;" 2>/dev/null || true
sudo -u postgres psql -d bitrium -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" 2>/dev/null || true
echo "  DB hazır"

# ── 5. PgBouncer ──────────────────────────────────────────────
echo "[5/12] PgBouncer kuruluyor..."
apt-get install -y pgbouncer

# Config
cp "$APP_DIR/deploy/pgbouncer.ini" /etc/pgbouncer/pgbouncer.ini

# userlist.txt (md5 hash yerine plaintext — production'da scram-sha-256 kullan)
echo '"bitrium" "'"${DB_PASSWORD}"'"' > /etc/pgbouncer/userlist.txt
chmod 640 /etc/pgbouncer/userlist.txt

# pgbouncer.ini'ye DB bağlantısını yaz
sed -i "s|^bitrium.*|bitrium = host=127.0.0.1 port=5432 dbname=bitrium|" /etc/pgbouncer/pgbouncer.ini 2>/dev/null || true

# Log ve pid dizinleri (paket oluşturmayabiliyor)
mkdir -p /var/log/pgbouncer /var/run/pgbouncer
chmod 777 /var/log/pgbouncer /var/run/pgbouncer

systemctl enable pgbouncer
systemctl restart pgbouncer
echo "  PgBouncer hazır (port 6432)"

# ── 6. Redis ──────────────────────────────────────────────────
echo "[6/12] Redis kuruluyor..."
apt-get install -y redis-server
cp "$APP_DIR/deploy/redis.conf" /etc/redis/redis.conf
systemctl enable redis-server
systemctl restart redis-server
echo "  Redis hazır"

# ── 7. Nginx ──────────────────────────────────────────────────
echo "[7/12] Nginx kuruluyor..."
apt-get install -y nginx
mkdir -p "$WEB_DIR"

cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/bitrium
ln -sf /etc/nginx/sites-available/bitrium /etc/nginx/sites-enabled/bitrium
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl enable nginx && systemctl restart nginx
echo "  Nginx hazır"

# ── 8. SSL (Let's Encrypt) ────────────────────────────────────
echo "[8/12] SSL sertifikası..."
apt-get install -y certbot python3-certbot-nginx
read -rp "Domain adı (örn: bitrium.io, boş bırak = atla): " DOMAIN
if [ -n "$DOMAIN" ]; then
  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
    --non-interactive --agree-tos --redirect \
    -m "admin@${DOMAIN}" || echo "  SSL atlandı — DNS ayarı yapıldıktan sonra tekrar çalıştır"
  systemctl enable certbot.timer
fi

# ── 9. Uygulama kurulumu ──────────────────────────────────────
echo "[9/12] Uygulama kuruluyor..."
cd "$APP_DIR"

# Secrets üret
ENCRYPTION_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')

read -rp "Admin email: " ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@bitrium.io}
read -rsp "Admin şifre: " ADMIN_PASSWORD
echo ""
ADMIN_PASSWORD=${ADMIN_PASSWORD:-$(openssl rand -base64 16)}

# .env dosyası
cat > "$APP_DIR/.env" <<ENV
NODE_ENV=production
HOST=127.0.0.1
PORT=8090
DB_HOST=127.0.0.1
DB_PORT=6432
DB_NAME=bitrium
DB_USER=bitrium
DB_PASSWORD=${DB_PASSWORD}
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
ENCRYPTION_KEY=${ENCRYPTION_KEY}
JWT_SECRET=${JWT_SECRET}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
HUB_EXTERNAL=false
MAX_BOTS_PER_USER=50
ENV
chmod 600 "$APP_DIR/.env"

# Frontend build
echo "  Frontend build ediliyor..."
npm ci --ignore-scripts
npm run build

# Vite dist → nginx web root
cp -r dist "$WEB_DIR/"

# Server dependencies
cd "$APP_DIR/server"
npm ci --ignore-scripts --omit=dev

# ── 10. Migrations ────────────────────────────────────────────
echo "[10/12] DB migration'ları çalıştırılıyor..."
cd "$APP_DIR"
export PGPASSWORD="$DB_PASSWORD"
for migration in server/migrations/*.sql; do
  echo "  Applying: $migration"
  psql -U bitrium -h 127.0.0.1 -d bitrium -f "$migration" 2>/dev/null || echo "  (atlandı veya zaten mevcut)"
done
unset PGPASSWORD

# ── 11. PM2 başlat ────────────────────────────────────────────
echo "[11/12] PM2 başlatılıyor..."
cd "$APP_DIR"
pm2 delete all 2>/dev/null || true
pm2 start deploy/pm2.ecosystem.config.js
pm2 save

# PM2 systemd servis
pm2 startup systemd -u root --hp /root 2>/dev/null | grep "sudo" | bash || true
echo "  PM2 hazır"

# ── 12. Firewall ──────────────────────────────────────────────
echo "[12/12] Firewall ayarlanıyor..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "  UFW: SSH + 80 + 443 açık"

# ── Özet ──────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  Kurulum Tamamlandı!"
echo "════════════════════════════════════════"
echo ""
echo "Secrets dosyası: $APP_DIR/.env"
echo "Loglar:          pm2 logs"
echo "Monitor:         pm2 monit"
echo "DB:              psql -U bitrium -h 127.0.0.1 -d bitrium"
echo ""
echo "Health check:"
echo "  curl http://localhost:8090/api/health"
echo ""
if [ -n "${DOMAIN:-}" ]; then
  echo "Site: https://$DOMAIN"
fi
echo ""
echo "⚠  Secrets'ı güvenli bir yere kaydet:"
echo "   ENCRYPTION_KEY=${ENCRYPTION_KEY}"
echo "   DB_PASSWORD=${DB_PASSWORD}"
