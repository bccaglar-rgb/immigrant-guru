# Bitrium Infrastructure Architecture

> Status: Architecture Proposal
> Last Updated: 2026-04-04
> Priority: High -- single droplet is the biggest operational risk

---

## Table of Contents

1. [Current State and Risks](#current-state-and-risks)
2. [Target Environment](#target-environment)
3. [Why Stay on DigitalOcean](#why-stay-on-digitalocean)
4. [Containerization Strategy](#containerization-strategy)
5. [Load Balancing](#load-balancing)
6. [Zero-Downtime Deployment](#zero-downtime-deployment)
7. [Rollback Strategy](#rollback-strategy)
8. [Staging and Production Separation](#staging-and-production-separation)
9. [Networking and Topology](#networking-and-topology)
10. [Secrets Management](#secrets-management)
11. [CI/CD Pipeline](#cicd-pipeline)
12. [Backup Strategy](#backup-strategy)
13. [Disaster Recovery](#disaster-recovery)
14. [Autoscaling Triggers](#autoscaling-triggers)
15. [Phased Cost Plan](#phased-cost-plan)

---

## 1. Current State and Risks

### Current Setup

```
Single DigitalOcean Droplet ($48/mo, 4vCPU, 8GB RAM)
├── Nginx (reverse proxy + static files)
├── PM2
│   ├── API Worker 1 (Express)
│   ├── API Worker 2 (Express)
│   ├── API Worker 3 (Express)
│   └── market-hub (WS data aggregator)
├── PostgreSQL (self-managed)
├── Redis (self-managed)
└── GitHub Actions (CI/CD, deploy via SSH)
```

### Risk Assessment

| Risk | Severity | Impact | Probability |
|------|----------|--------|-------------|
| Single droplet failure | CRITICAL | Complete outage | Medium |
| Self-managed PG data loss | CRITICAL | Unrecoverable data loss | Low-Medium |
| Self-managed Redis data loss | HIGH | Session loss, cache miss | Medium |
| Nginx misconfiguration | HIGH | Outage or security breach | Low |
| Disk full | HIGH | Database corruption | Medium |
| No staging environment | MEDIUM | Production bugs from untested code | High |
| No health checks | MEDIUM | Silent failures | Medium |
| Manual deployment | MEDIUM | Human error, downtime | Medium |

### Current Resource Utilization (Estimated)

| Resource | Current Usage | Headroom |
|----------|-------------|----------|
| CPU | ~30% avg, ~70% peak | Limited |
| RAM | ~60% (PG + Redis + Node) | Tight |
| Disk | ~40% of 160GB | Adequate |
| Network | ~50 Mbps avg | Adequate |

---

## 2. Target Environment

### Architecture Evolution

```
Phase 1 (Current + Quick Wins):
  Droplet + Managed PG + Managed Redis

Phase 2 (Reliability):
  2 Droplets + LB + Managed PG (primary + replica) + Managed Redis

Phase 3 (Scale):
  Docker Compose on droplets OR DOKS (Kubernetes)
  Separate services: API, WS Gateway, market-hub, AI worker

Phase 4+ (Enterprise):
  DOKS cluster with auto-scaling node pools
```

---

## 3. Why Stay on DigitalOcean

### Cost Comparison (Monthly, for equivalent resources)

| Service | DigitalOcean | AWS | GCP |
|---------|-------------|-----|-----|
| 2x App Servers (4vCPU, 8GB) | $96 | $140 (t3.xlarge) | $130 (e2-standard-4) |
| Managed PostgreSQL (4GB) | $60 | $130 (RDS db.t3.medium) | $100 (Cloud SQL) |
| Managed Redis (2GB) | $30 | $50 (ElastiCache t3.medium) | $45 (Memorystore) |
| Load Balancer | $12 | $25 (ALB) | $20 (Cloud LB) |
| Object Storage (100GB) | $5 | $5 (S3) | $5 (GCS) |
| **Total** | **$203** | **$350** | **$300** |

### Additional DO Advantages

- Simpler pricing model (no hidden costs like data transfer)
- Adequate for current scale (sub-10K users)
- Team already familiar with DO
- Managed databases include backups, failover, patches
- DOKS available when Kubernetes is needed
- App Platform available as a simpler alternative

### When to Consider Migration

- Need for multi-region (DO has fewer regions)
- Need for specialized services (ML inference, managed Kafka)
- Scale beyond 50K concurrent users
- Compliance requirements requiring specific certifications

---

## 4. Containerization Strategy

### Phase 1: Docker Compose for Development

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://bitrium:dev@postgres:5432/bitrium
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./src:/app/src    # Hot reload in dev

  market-hub:
    build:
      context: .
      dockerfile: Dockerfile.market-hub
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  ws-gateway:
    build:
      context: .
      dockerfile: Dockerfile.ws-gateway
    ports:
      - "3001:3001"
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: bitrium
      POSTGRES_USER: bitrium
      POSTGRES_PASSWORD: dev
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bitrium"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### Dockerfile (Multi-Stage Build)

```dockerfile
# Dockerfile.api
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S bitrium -u 1001
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER bitrium
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

### Phase 3: Docker Compose for Production

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  api:
    image: registry.digitalocean.com/bitrium/api:${VERSION}
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
      restart_policy:
        condition: on-failure
        max_attempts: 3
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  ws-gateway:
    image: registry.digitalocean.com/bitrium/ws-gateway:${VERSION}
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 512M

  market-hub:
    image: registry.digitalocean.com/bitrium/market-hub:${VERSION}
    deploy:
      replicas: 1          # Singleton, handles reconnection
      resources:
        limits:
          cpus: '1.0'
          memory: 1G

  ai-worker:
    image: registry.digitalocean.com/bitrium/ai-worker:${VERSION}
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

---

## 5. Load Balancing

### Nginx Configuration (Current Phase)

```nginx
upstream api_backend {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3002;
    server 127.0.0.1:3004;

    keepalive 32;
}

upstream ws_backend {
    # IP hash for connection persistence (optional with Redis adapter)
    ip_hash;
    server 127.0.0.1:3001;
}

server {
    listen 443 ssl http2;
    server_name api.bitrium.com;

    # SSL
    ssl_certificate /etc/letsencrypt/live/bitrium.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bitrium.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # API routes
    location /api/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 5s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # WebSocket routes
    location /ws/ {
        proxy_pass http://ws_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        proxy_read_timeout 86400s;    # 24h for WS connections
        proxy_send_timeout 86400s;
    }

    # Static assets (Vite build)
    location / {
        root /var/www/bitrium/dist;
        try_files $uri $uri/ /index.html;

        # Cache static assets aggressively
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Health check endpoint (no auth)
    location /health {
        proxy_pass http://api_backend;
        access_log off;
    }
}
```

### DigitalOcean Load Balancer (Phase 2)

When running multiple droplets:
- DO LB in front ($12/mo)
- SSL termination at LB
- Health check: HTTP GET /health every 10s
- Sticky sessions: not needed (stateless API, Redis sessions)
- Forwarding rules: 443 -> 3000 (API), 443 -> 3001 (WS with pass-through)

---

## 6. Zero-Downtime Deployment

### Blue/Green with Nginx

```bash
#!/bin/bash
# deploy.sh -- Zero-downtime deploy using blue/green with Nginx
set -euo pipefail

DEPLOY_DIR="/var/www/bitrium"
BLUE_DIR="$DEPLOY_DIR/blue"
GREEN_DIR="$DEPLOY_DIR/green"
CURRENT_LINK="$DEPLOY_DIR/current"
VERSION=$1

# Determine which environment is live
if [ "$(readlink $CURRENT_LINK)" = "$BLUE_DIR" ]; then
    TARGET=$GREEN_DIR
    TARGET_NAME="green"
else
    TARGET=$BLUE_DIR
    TARGET_NAME="blue"
fi

echo "Deploying version $VERSION to $TARGET_NAME"

# 1. Deploy new version to target
rsync -a --delete "dist/" "$TARGET/"
cp "$TARGET/.env.production" "$TARGET/.env"

# 2. Install dependencies
cd "$TARGET" && npm ci --production

# 3. Run migrations (if any)
npm run migrate

# 4. Start new PM2 instances
pm2 start ecosystem.config.js --env production --name "api-$TARGET_NAME"

# 5. Health check new instances
for i in {1..30}; do
    if curl -sf "http://localhost:${TARGET_PORT}/health" > /dev/null; then
        echo "Health check passed"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Health check failed, rolling back"
        pm2 delete "api-$TARGET_NAME"
        exit 1
    fi
    sleep 1
done

# 6. Switch Nginx upstream
ln -sfn "$TARGET" "$CURRENT_LINK"
nginx -s reload

# 7. Stop old instances (after drain period)
sleep 10
pm2 delete "api-$( [ "$TARGET_NAME" = "blue" ] && echo "green" || echo "blue" )" || true

echo "Deploy complete: $VERSION on $TARGET_NAME"
```

### Health Check Endpoint

```javascript
app.get('/health', async (req, res) => {
  const checks = {
    status: 'ok',
    version: process.env.APP_VERSION,
    uptime: process.uptime(),
    checks: {}
  };

  // Database check
  try {
    await db.query('SELECT 1');
    checks.checks.database = 'ok';
  } catch (e) {
    checks.checks.database = 'failing';
    checks.status = 'degraded';
  }

  // Redis check
  try {
    await redis.ping();
    checks.checks.redis = 'ok';
  } catch (e) {
    checks.checks.redis = 'failing';
    checks.status = 'degraded';
  }

  const statusCode = checks.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});
```

---

## 7. Rollback Strategy

### Keep Last 3 Builds

```bash
# Directory structure
/var/www/bitrium/
├── releases/
│   ├── 2026-04-01_v1.2.3/
│   ├── 2026-04-02_v1.2.4/
│   └── 2026-04-04_v1.3.0/    # current
├── current -> releases/2026-04-04_v1.3.0/
└── shared/
    ├── .env
    ├── uploads/
    └── logs/
```

### Rollback Script

```bash
#!/bin/bash
# rollback.sh -- Roll back to previous version
set -euo pipefail

DEPLOY_DIR="/var/www/bitrium"
RELEASES_DIR="$DEPLOY_DIR/releases"
CURRENT=$(readlink "$DEPLOY_DIR/current")

# Find previous release
PREVIOUS=$(ls -1t "$RELEASES_DIR" | sed -n '2p')

if [ -z "$PREVIOUS" ]; then
    echo "No previous release to roll back to"
    exit 1
fi

echo "Rolling back from $(basename $CURRENT) to $PREVIOUS"

# 1. Switch symlink
ln -sfn "$RELEASES_DIR/$PREVIOUS" "$DEPLOY_DIR/current"

# 2. Restart PM2
pm2 restart all

# 3. Health check
sleep 5
if ! curl -sf http://localhost:3000/health > /dev/null; then
    echo "WARNING: Health check failed after rollback"
    exit 1
fi

# 4. Reload Nginx
nginx -s reload

echo "Rollback complete to $PREVIOUS"
```

### Cleanup Old Releases

```bash
# Keep only last 3 releases
cd /var/www/bitrium/releases
ls -1t | tail -n +4 | xargs rm -rf
```

---

## 8. Staging and Production Separation

### Environment Matrix

| Aspect | Staging | Production |
|--------|---------|------------|
| Droplet | s-2vcpu-4gb ($24/mo) | s-4vcpu-8gb ($48/mo) |
| Database | Managed PG (smallest) | Managed PG (4GB) |
| Redis | Managed Redis (smallest) | Managed Redis (2GB) |
| Domain | staging.bitrium.com | bitrium.com |
| Data | Anonymized production copy | Real data |
| Exchanges | Testnet/sandbox APIs | Live APIs |
| Payments | TRON testnet (Nile) | TRON mainnet |
| AI | Same providers, lower limits | Full limits |
| CI/CD | Auto-deploy on PR merge to develop | Manual approve for main |

### Environment Configuration

```javascript
// config/index.js
const configs = {
  development: {
    db: { host: 'localhost', ssl: false },
    redis: { host: 'localhost' },
    tron: { network: 'nile' },        // testnet
    rateLimits: { multiplier: 10 },    // relaxed
  },
  staging: {
    db: { host: process.env.DATABASE_URL, ssl: true },
    redis: { host: process.env.REDIS_URL },
    tron: { network: 'nile' },         // testnet
    rateLimits: { multiplier: 2 },     // slightly relaxed
  },
  production: {
    db: { host: process.env.DATABASE_URL, ssl: true },
    redis: { host: process.env.REDIS_URL },
    tron: { network: 'mainnet' },
    rateLimits: { multiplier: 1 },     // strict
  }
};
```

---

## 9. Networking and Topology

### Target Topology

```
                    Internet
                       |
                +------+------+
                |   DO LB     |  ($12/mo)
                | SSL termination
                +------+------+
                       |
          +------------+------------+
          |                         |
    +-----+------+           +-----+------+
    | Droplet 1  |           | Droplet 2  |
    | API x2     |           | API x1     |
    | WS Gateway |           | WS Gateway |
    | market-hub |           | AI worker  |
    +-----+------+           +-----+------+
          |                         |
          +--------+   +------------+
                   |   |
            +------+---+------+
            | VPC (10.0.0.0/16)|
            |                   |
            | +---------------+ |
            | | Managed PG    | |
            | | Primary + RO  | |
            | +---------------+ |
            |                   |
            | +---------------+ |
            | | Managed Redis | |
            | +---------------+ |
            +-------------------+
```

### VPC Configuration

- All resources in a single VPC (10.0.0.0/16)
- Managed databases accessible only within VPC (no public endpoints)
- Droplets communicate over private network (free, low latency)
- Only the load balancer has a public IP

### Firewall Rules

| Rule | Source | Destination | Port | Action |
|------|--------|-------------|------|--------|
| LB to Droplets | LB | Droplets | 3000, 3001 | Allow |
| Droplets to PG | Droplets | Managed PG | 25060 | Allow |
| Droplets to Redis | Droplets | Managed Redis | 25061 | Allow |
| Droplets to Droplets | VPC | VPC | All | Allow |
| SSH (deploy) | GitHub Actions IP | Droplets | 22 | Allow |
| All other inbound | * | Droplets | * | Deny |

---

## 10. Secrets Management

### Phase 1: DigitalOcean App-Level Env Vars

- Store secrets as encrypted environment variables on each droplet
- Access via process.env
- Rotate by updating env vars and restarting

### Phase 2: DigitalOcean Secrets (if available) or doctl

```bash
# Store secrets using doctl
doctl compute droplet update DROPLET_ID \
  --user-data-file secrets.env.encrypted

# Or use DO App Platform secrets
doctl apps update APP_ID \
  --spec app-spec.yaml  # secrets defined in spec
```

### Phase 3: HashiCorp Vault (if needed)

Only if:
- Multiple teams need different access levels
- Regulatory requirements for secret audit trails
- Dynamic secrets needed (e.g., short-lived DB credentials)

---

## 11. CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm test
      - run: npm run lint
      - run: npm run build

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Build and push Docker image
        run: |
          docker build -t registry.digitalocean.com/bitrium/api:${{ github.sha }} .
          docker push registry.digitalocean.com/bitrium/api:${{ github.sha }}
      - name: Deploy to staging
        run: |
          ssh deploy@staging.bitrium.com "cd /var/www/bitrium && ./deploy.sh ${{ github.sha }}"
      - name: Health check
        run: |
          sleep 10
          curl -sf https://staging.bitrium.com/health

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://bitrium.com
    steps:
      - name: Deploy to production
        run: |
          ssh deploy@bitrium.com "cd /var/www/bitrium && ./deploy.sh ${{ github.sha }}"
      - name: Health check
        run: |
          sleep 10
          curl -sf https://bitrium.com/health
      - name: Notify
        if: success()
        run: echo "Deployed ${{ github.sha }} to production"
```

---

## 12. Backup Strategy

| What | Method | Frequency | Retention | Storage |
|------|--------|-----------|-----------|---------|
| PostgreSQL | DO Managed (auto) | Daily | 7 days | DO |
| PostgreSQL | pg_dump | Daily | 30 days | DO Spaces |
| Redis | RDB snapshot | Hourly | 24 hours | Local + DO Spaces |
| Application code | Git | Every push | Forever | GitHub |
| Nginx config | Git | On change | Forever | GitHub |
| Environment vars | Encrypted backup | Weekly | 90 days | DO Spaces |
| Uploaded files | rsync to Spaces | Daily | 90 days | DO Spaces |

---

## 13. Disaster Recovery

### Recovery Time Objectives

| Scenario | RTO | RPO | Strategy |
|----------|-----|-----|----------|
| Single droplet failure | 5 min | 0 | LB + second droplet |
| Database failure | 1 min | 0 | Managed PG auto-failover |
| Redis failure | 2 min | 5 min | Managed Redis auto-failover |
| Full region outage | 4 hours | 1 hour | Restore from backups in new region |
| Data corruption | 1 hour | 15 min | PITR restore |
| Ransomware/breach | 2 hours | 1 hour | Clean restore from off-site backup |

### Disaster Recovery Runbook

```
1. ASSESS
   - Identify what failed (check DO status page, monitoring)
   - Determine scope (single service vs entire infrastructure)

2. COMMUNICATE
   - Update status page
   - Notify team via Slack/PagerDuty

3. RECOVER
   - Droplet failure: DO auto-recovery or create new from snapshot
   - DB failure: Managed PG handles failover automatically
   - Full region: spin up in new region from latest backup
     a. Create new managed PG, restore from backup
     b. Create new managed Redis
     c. Create new droplets, deploy latest release
     d. Update DNS

4. VERIFY
   - Health checks passing
   - Data integrity (reconciliation)
   - User-facing functionality

5. POST-MORTEM
   - Document timeline
   - Root cause analysis
   - Action items to prevent recurrence
```

---

## 14. Autoscaling Triggers

### Manual Scaling Triggers (Phase 2)

Since DO droplets don't auto-scale, define manual triggers:

| Metric | Threshold | Action |
|--------|-----------|--------|
| API response p99 > 2s for 5 min | Scale up | Add API droplet |
| CPU > 80% for 10 min | Scale up | Add or resize droplet |
| Memory > 85% | Scale up | Resize droplet |
| WS connections > 50K/gateway | Scale out | Add WS gateway droplet |
| DB connections > 80% of max | Scale up | Resize managed PG |
| DB replication lag > 30s | Investigate | Check replica health |

### DOKS Auto-Scaling (Phase 5)

```yaml
# Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

---

## 15. Phased Cost Plan

### Phase 1: Foundation (Current + Quick Wins) -- $120/mo

| Resource | Spec | Cost |
|----------|------|------|
| Droplet (existing) | s-4vcpu-8gb | $48 |
| Managed PostgreSQL | db-s-1vcpu-2gb | $30 |
| Managed Redis | db-s-1vcpu-1gb | $15 |
| DO Spaces (backups) | 100GB | $5 |
| Domain + SSL | Let's Encrypt | $0 |
| Container Registry | Basic | $5 |
| **Total** | | **$103** |

### Phase 2: Reliability -- $230/mo

| Resource | Spec | Cost |
|----------|------|------|
| Droplet (primary) | s-4vcpu-8gb | $48 |
| Droplet (secondary) | s-2vcpu-4gb | $24 |
| Load Balancer | Standard | $12 |
| Managed PG (primary + standby) | db-s-2vcpu-4gb | $60 |
| PG Read Replica | db-s-1vcpu-2gb | $30 |
| Managed Redis | db-s-1vcpu-2gb | $30 |
| DO Spaces | 250GB | $10 |
| Staging Droplet | s-2vcpu-4gb | $24 |
| Staging PG | db-s-1vcpu-1gb | $15 |
| **Total** | | **$253** |

### Phase 3: Scale -- $400/mo

| Resource | Spec | Cost |
|----------|------|------|
| 3x App Droplets | s-4vcpu-8gb | $144 |
| Load Balancer | Standard | $12 |
| Managed PG (HA) | db-s-4vcpu-8gb | $120 |
| PG Read Replica | db-s-2vcpu-4gb | $60 |
| Managed Redis | db-s-2vcpu-4gb | $40 |
| DO Spaces | 500GB | $15 |
| Container Registry | Professional | $10 |
| Staging (shared) | | $40 |
| **Total** | | **$441** |

### Phase 5: Enterprise (DOKS) -- $800+/mo

| Resource | Spec | Cost |
|----------|------|------|
| DOKS Cluster (3 nodes) | s-4vcpu-8gb | $144 + $12 |
| DOKS Worker Pool (auto-scale) | 2-6 nodes | $96-$288 |
| Managed PG (HA, large) | db-s-8vcpu-16gb | $240 |
| PG Read Replica | db-s-4vcpu-8gb | $120 |
| Managed Redis Cluster | 3 nodes | $90 |
| DO Spaces | 1TB | $25 |
| **Total (estimated)** | | **$800-$1000** |

---

## Appendix: Infrastructure Checklist

```
Phase 1 (Week 1-2):
[ ] Migrate PostgreSQL to DO Managed
[ ] Migrate Redis to DO Managed
[ ] Set up DO Spaces for backups
[ ] Configure automated PG backups
[ ] Add health check endpoints
[ ] Docker Compose for local development
[ ] Set up container registry

Phase 2 (Week 3-4):
[ ] Add second droplet
[ ] Configure DO Load Balancer
[ ] Set up PG read replica
[ ] Create staging environment
[ ] Implement blue/green deploy script
[ ] Configure VPC and firewall rules
[ ] Set up Grafana dashboards

Phase 3 (Week 5-8):
[ ] Containerize all services
[ ] Separate WS gateway
[ ] Separate AI worker
[ ] Separate market-hub
[ ] Docker Compose production deployment
[ ] Implement proper rollback
[ ] Load testing

Phase 5 (Month 4+):
[ ] Evaluate DOKS vs Docker Compose
[ ] If DOKS: set up cluster, migrate services
[ ] Configure HPA
[ ] Set up cluster monitoring
```
