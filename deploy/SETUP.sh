#!/bin/bash
# ── Bitrium Production Server Setup ──────────────────────────
# Run ONCE on a fresh DigitalOcean CPU-Optimized 4 vCPU / 8 GB droplet
# OS: Ubuntu 22.04 or 24.04
#
# Usage: ssh root@YOUR_SERVER_IP < deploy/SETUP.sh
# ──────────────────────────────────────────────────────────────

set -euo pipefail

echo "=== Bitrium Server Setup ==="

# ── 1. System updates ────────────────────────────────────────
apt-get update && apt-get upgrade -y

# ── 2. Node.js 22 ───────────────────────────────────────────
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node --version)"

# ── 3. PM2 ──────────────────────────────────────────────────
npm install -g pm2
pm2 startup systemd -u root --hp /root
echo "PM2 installed"

# ── 4. PostgreSQL 16 ────────────────────────────────────────
if ! command -v psql &> /dev/null; then
  apt-get install -y postgresql-16 postgresql-contrib-16
fi
systemctl enable postgresql
systemctl start postgresql

# Create user and database
sudo -u postgres psql -c "CREATE USER bitrium_app WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE bitrium_db OWNER bitrium_app;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE bitrium_db TO bitrium_app;" 2>/dev/null || true

# PostgreSQL memory tuning for 8 GB server
cat > /tmp/pg_tuning.conf << 'PGCONF'
# Bitrium PostgreSQL tuning (8 GB server)
shared_buffers = 512MB
effective_cache_size = 1536MB
work_mem = 8MB
maintenance_work_mem = 128MB
max_connections = 100
wal_buffers = 16MB
checkpoint_completion_target = 0.9
random_page_cost = 1.1
PGCONF

PG_CONF_DIR=$(find /etc/postgresql -name "postgresql.conf" -print -quit | xargs dirname)
if [ -n "$PG_CONF_DIR" ]; then
  cp /tmp/pg_tuning.conf "$PG_CONF_DIR/conf.d/bitrium.conf"
  mkdir -p "$PG_CONF_DIR/conf.d"
  echo "include_dir = 'conf.d'" >> "$PG_CONF_DIR/postgresql.conf" 2>/dev/null || true
  systemctl restart postgresql
fi
echo "PostgreSQL configured"

# ── 5. Redis ────────────────────────────────────────────────
if ! command -v redis-server &> /dev/null; then
  apt-get install -y redis-server
fi
systemctl enable redis-server

# Redis memory config
cat > /etc/redis/redis.conf.d/bitrium.conf 2>/dev/null << 'REDISCONF' || true
maxmemory 512mb
maxmemory-policy allkeys-lru
appendonly yes
REDISCONF

# Alternative: direct edit if conf.d not supported
sed -i 's/^# maxmemory .*/maxmemory 512mb/' /etc/redis/redis.conf
sed -i 's/^# maxmemory-policy .*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf
systemctl restart redis-server
echo "Redis configured"

# ── 6. Nginx ────────────────────────────────────────────────
if ! command -v nginx &> /dev/null; then
  apt-get install -y nginx
fi
systemctl enable nginx

# Create web directory
mkdir -p /var/www/bitrium/dist

# Copy nginx config (will be synced from deploy/nginx/bitrium.conf)
# After first deploy, run:
#   cp /var/www/bitrium/deploy/nginx/bitrium.conf /etc/nginx/sites-available/bitrium
#   ln -sf /etc/nginx/sites-available/bitrium /etc/nginx/sites-enabled/
#   rm -f /etc/nginx/sites-enabled/default
#   nginx -t && systemctl reload nginx

echo "Nginx installed"

# ── 7. Certbot (Let's Encrypt SSL) ──────────────────────────
apt-get install -y certbot python3-certbot-nginx
# After Nginx config + DNS are set up:
#   certbot --nginx -d bitrium.com -d www.bitrium.com
echo "Certbot installed"

# ── 8. Create DB schema ─────────────────────────────────────
# Will be run on first deploy:
#   PGPASSWORD=xxx psql -U bitrium_app -d bitrium_db -f /var/www/bitrium/server/src/db/schema.sql

# ── 9. Firewall ─────────────────────────────────────────────
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "Firewall configured (22, 80, 443 open)"

# ── 10. Environment variables ───────────────────────────────
# Create .env file for PM2:
cat > /var/www/bitrium/.env << 'ENVFILE'
NODE_ENV=production
HOST=127.0.0.1
PORT=8090
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=bitrium_db
DB_USER=bitrium_app
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
ADMIN_EMAIL=admin@bitrium.com
ADMIN_PASSWORD=CHANGE_ME_ADMIN_PASSWORD
ENVFILE
chmod 600 /var/www/bitrium/.env
echo "Environment file created — EDIT PASSWORDS IN /var/www/bitrium/.env"

echo ""
echo "=== Setup Complete ==="
echo "Next steps:"
echo "  1. Edit /var/www/bitrium/.env — change passwords"
echo "  2. Push to main branch — GitHub Actions will deploy"
echo "  3. After first deploy:"
echo "     cp /var/www/bitrium/deploy/nginx/bitrium.conf /etc/nginx/sites-available/bitrium"
echo "     ln -sf /etc/nginx/sites-available/bitrium /etc/nginx/sites-enabled/"
echo "     rm -f /etc/nginx/sites-enabled/default"
echo "     nginx -t && systemctl reload nginx"
echo "  4. Set up DNS A record for bitrium.com → server IP"
echo "  5. certbot --nginx -d bitrium.com -d www.bitrium.com"
echo "  6. Set up CloudFlare (optional but recommended)"
