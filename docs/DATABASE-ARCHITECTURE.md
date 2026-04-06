# Bitrium Database Architecture

> Status: Architecture Proposal
> Last Updated: 2026-04-04
> Priority: High -- data integrity is the foundation of a financial platform

---

## Table of Contents

1. [Current State](#current-state)
2. [PostgreSQL Scaling Strategy](#postgresql-scaling-strategy)
3. [Table Partitioning](#table-partitioning)
4. [TimescaleDB Recommendation](#timescaledb-recommendation)
5. [Redis vs PostgreSQL Data Split](#redis-vs-postgresql-data-split)
6. [Cache Invalidation Strategy](#cache-invalidation-strategy)
7. [Data Retention Policy](#data-retention-policy)
8. [Index Strategy](#index-strategy)
9. [Schema Evolution and Migration Safety](#schema-evolution-and-migration-safety)
10. [Connection Pooling](#connection-pooling)
11. [Backup and Recovery](#backup-and-recovery)
12. [Encryption at Rest](#encryption-at-rest)
13. [Monitoring and Alerting](#monitoring-and-alerting)

---

## 1. Current State

### Current Setup

- Single PostgreSQL instance on the same DigitalOcean droplet
- No read replicas
- No table partitioning
- No connection pooler (direct connections from 3 PM2 workers + market-hub)
- Redis used opportunistically for caching, no formal data-split policy
- Backups: manual or cron-based pg_dump (unverified)
- API keys stored in plaintext JSONB (see SECURITY-HARDENING.md)

### Known Issues

| Issue | Impact | Priority |
|-------|--------|----------|
| Single instance, no replicas | Complete downtime on failure | Critical |
| No connection pooler | Connection exhaustion under load | High |
| No partitioning | payment_events and market data tables growing unbounded | High |
| No formal backup verification | Data loss risk | Critical |
| Mixed read/write on single instance | Write latency affected by heavy reads | Medium |

---

## 2. PostgreSQL Scaling Strategy

### Phase 1: Managed PostgreSQL (Week 3-4)

Move from self-managed to DigitalOcean Managed PostgreSQL:

- Automated backups with point-in-time recovery
- Automated failover with standby nodes
- Managed OS and PG patches
- Connection limits: start with db-s-2vcpu-4gb ($60/mo)

### Phase 2: Read Replica (Week 3-4)

```
                     +------------------+
                     |   pgBouncer      |
                     | (connection pool) |
                     +--------+---------+
                              |
               +--------------+--------------+
               |                             |
        Write queries                  Read queries
               |                             |
      +--------+--------+         +---------+--------+
      |  Primary (RW)   |  --->   |  Replica (RO)    |
      |  DO Managed PG  | stream  |  DO Managed PG   |
      +-----------------+         +------------------+
```

**Read replica routing rules:**

| Query Type | Target | Examples |
|------------|--------|---------|
| Writes (INSERT/UPDATE/DELETE) | Primary | Payment creation, user updates |
| Transactional reads | Primary | Balance checks before payment |
| Analytics/reporting | Replica | Dashboard stats, admin reports |
| Market data queries | Replica | Historical price lookups |
| User profile reads | Replica | Profile display, tier checks |

**Implementation:** Use a query router middleware:

```javascript
const db = {
  primary: new Pool({ connectionString: PRIMARY_URL }),
  replica: new Pool({ connectionString: REPLICA_URL }),

  query(sql, params, { readOnly = false } = {}) {
    const pool = readOnly ? this.replica : this.primary;
    return pool.query(sql, params);
  }
};
```

### Phase 3: Vertical Scaling

Before horizontal sharding (which adds enormous complexity), scale vertically:

- db-s-4vcpu-8gb for primary ($120/mo)
- Optimize queries and indexes first
- Sharding only if single-primary write throughput is insufficient (unlikely under 100K users)

---

## 3. Table Partitioning

### payment_events: Partition by Month

```sql
CREATE TABLE payment_events (
    id              BIGSERIAL,
    invoice_id      UUID NOT NULL,
    event_type      TEXT NOT NULL,
    amount          NUMERIC(20,8),
    currency        TEXT,
    tx_hash         TEXT,
    block_number    BIGINT,
    confirmations   INTEGER DEFAULT 0,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE payment_events_2026_01 PARTITION OF payment_events
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE payment_events_2026_02 PARTITION OF payment_events
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- ... continue for each month

-- Automate partition creation (run monthly via cron or pg_partman)
```

**Benefits:**

- Queries scoped to a time range scan only relevant partitions
- Old partitions can be detached and archived without locking
- VACUUM operates on smaller tables
- Index maintenance is faster per partition

### market_data: Partition by Day

```sql
CREATE TABLE market_data (
    id              BIGSERIAL,
    exchange        TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    data_type       TEXT NOT NULL,      -- ticker, kline, depth
    interval        TEXT,               -- 1m, 5m, 1h, 1d (for klines)
    open            NUMERIC(20,8),
    high            NUMERIC(20,8),
    low             NUMERIC(20,8),
    close           NUMERIC(20,8),
    volume          NUMERIC(20,8),
    data            JSONB,              -- additional fields
    timestamp       TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Daily partitions (higher volume than payment_events)
CREATE TABLE market_data_2026_04_04 PARTITION OF market_data
    FOR VALUES FROM ('2026-04-04') TO ('2026-04-05');
```

### Partition Management with pg_partman

```sql
CREATE EXTENSION pg_partman;

SELECT partman.create_parent(
    p_parent_table := 'public.payment_events',
    p_control := 'created_at',
    p_type := 'range',
    p_interval := '1 month',
    p_premake := 3              -- create 3 months ahead
);

SELECT partman.create_parent(
    p_parent_table := 'public.market_data',
    p_control := 'timestamp',
    p_type := 'range',
    p_interval := '1 day',
    p_premake := 7              -- create 7 days ahead
);
```

---

## 4. TimescaleDB Recommendation

### Why TimescaleDB for Market Data

TimescaleDB is a PostgreSQL extension optimized for time-series data. It provides:

- **Automatic partitioning** (hypertables) with no manual partition management
- **Compression** -- 90-95% compression ratio for time-series data
- **Continuous aggregates** -- materialized views that auto-refresh
- **Data retention policies** -- automated data lifecycle management
- **Full SQL compatibility** -- no query changes needed

### Implementation

```sql
-- Convert market_data to a hypertable
SELECT create_hypertable('market_data', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    migrate_data => true
);

-- Enable compression on chunks older than 7 days
ALTER TABLE market_data SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'exchange, symbol, data_type',
    timescaledb.compress_orderby = 'timestamp DESC'
);

SELECT add_compression_policy('market_data', INTERVAL '7 days');

-- Continuous aggregate for hourly OHLCV
CREATE MATERIALIZED VIEW market_data_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', timestamp) AS bucket,
    exchange,
    symbol,
    first(open, timestamp) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close, timestamp) AS close,
    sum(volume) AS volume
FROM market_data
WHERE data_type = 'kline'
GROUP BY bucket, exchange, symbol;

-- Auto-refresh policy
SELECT add_continuous_aggregate_policy('market_data_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);
```

### Recommendation

Use TimescaleDB for `market_data` only. Standard PostgreSQL partitioning is sufficient for `payment_events` (lower volume, different query patterns). TimescaleDB adds complexity and should be introduced only when market data persistence becomes a requirement.

---

## 5. Redis vs PostgreSQL Data Split

### Data Placement Rules

| Data Type | Store | Rationale |
|-----------|-------|-----------|
| User accounts | PG | Durable, relational, queried by multiple fields |
| Subscriptions/tiers | PG | Financial record, audit trail needed |
| Payment invoices | PG | Must be durable, ACID transactions |
| Payment events | PG | Audit trail, partitioned by time |
| API keys (encrypted) | PG | Durable, encrypted JSONB |
| Historical market data | PG (TimescaleDB) | Time-series queries, compression |
| AI analysis results | PG | Durable, linked to user |
| **Live market data** | **Redis** | Ephemeral, overwritten every tick |
| **Session tokens** | **Redis** | Short-lived, high read frequency |
| **WS tickets** | **Redis** | Single-use, 30s TTL |
| **Rate limit counters** | **Redis** | Ephemeral, high write frequency |
| **WS resync buffer** | **Redis** | 60s TTL, sorted sets |
| **User tier cache** | **Redis** | Cached from PG, 5min TTL |
| **Feature flags** | **Redis** | Fast reads, updated via admin API |
| **Active alerts** | **Redis** | Real-time matching, backed up to PG |

### Redis Data Structures

```
# Live market data (overwritten per tick)
SET   market:{exchange}:{symbol}:ticker   "{json}"   EX 30

# Session management
HSET  session:{sessionId}  userId "123"  tier "trader"  createdAt "..."
EXPIRE session:{sessionId} 86400

# Rate limiting (sliding window)
ZADD  ratelimit:{userId}:{endpoint}  {timestamp}  {requestId}
ZREMRANGEBYSCORE ratelimit:{userId}:{endpoint} 0 {windowStart}

# WS resync buffer (sorted set, score = timestamp)
ZADD  wsbuf:market:binance:BTCUSDT:ticker  {timestamp}  "{message}"
EXPIRE wsbuf:market:binance:BTCUSDT:ticker  120

# User tier cache
SET   user:{userId}:tier  "trader"  EX 300
```

---

## 6. Cache Invalidation Strategy

### Patterns

| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| TTL-based expiry | Market data, tier cache | Redis EX/PEXPIRE |
| Write-through | User profile updates | Update PG, then update Redis |
| Event-driven invalidation | Subscription changes | PG NOTIFY -> app invalidates Redis |
| Cache-aside | AI results, analytics | Check Redis, miss -> query PG, populate Redis |

### PG NOTIFY for Cache Invalidation

```sql
-- Trigger on subscription changes
CREATE OR REPLACE FUNCTION notify_subscription_change() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('cache_invalidation', json_build_object(
        'table', 'subscriptions',
        'op', TG_OP,
        'user_id', COALESCE(NEW.user_id, OLD.user_id)
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscription_cache_trigger
AFTER INSERT OR UPDATE OR DELETE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION notify_subscription_change();
```

```javascript
// Application listener
const pgClient = new pg.Client(DATABASE_URL);
await pgClient.connect();
await pgClient.query('LISTEN cache_invalidation');

pgClient.on('notification', (msg) => {
  const payload = JSON.parse(msg.payload);
  if (payload.table === 'subscriptions') {
    redis.del(`user:${payload.user_id}:tier`);
    redis.del(`user:${payload.user_id}:subscription`);
  }
});
```

---

## 7. Data Retention Policy

| Data Type | Hot (SSD) | Warm (Compressed) | Cold (Archive) | Delete |
|-----------|-----------|-------------------|----------------|--------|
| Payment events | 6 months | 2 years | 7 years | Never (financial) |
| Market data (raw ticks) | 7 days | 90 days | -- | After 90 days |
| Market data (1h agg) | 1 year | 5 years | -- | After 5 years |
| Market data (1d agg) | Forever | -- | -- | Never |
| AI analysis results | 90 days | 1 year | -- | After 1 year |
| User accounts | Active | -- | -- | 2 years after deletion request |
| Audit logs | 1 year | 3 years | 7 years | After 7 years |
| Session data | Active | -- | -- | On expiry |

### Automated Retention with TimescaleDB

```sql
-- Drop raw market data chunks older than 90 days
SELECT add_retention_policy('market_data', INTERVAL '90 days');
```

### Automated Retention with pg_partman

```sql
-- For payment_events: detach partitions older than 2 years
UPDATE partman.part_config
SET retention = '2 years', retention_keep_table = true
WHERE parent_table = 'public.payment_events';
```

---

## 8. Index Strategy

### Users Table

```sql
CREATE UNIQUE INDEX idx_users_email ON users (email);
CREATE UNIQUE INDEX idx_users_username ON users (lower(username));
CREATE INDEX idx_users_tier ON users (tier) WHERE active = true;
CREATE INDEX idx_users_created_at ON users (created_at);
```

### Subscriptions Table

```sql
CREATE INDEX idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions (status) WHERE status = 'active';
CREATE INDEX idx_subscriptions_expires_at ON subscriptions (expires_at) WHERE status = 'active';
```

### Payment Invoices Table

```sql
CREATE UNIQUE INDEX idx_invoices_invoice_id ON invoices (invoice_id);
CREATE INDEX idx_invoices_user_id ON invoices (user_id);
CREATE INDEX idx_invoices_status ON invoices (status);
CREATE INDEX idx_invoices_wallet_address ON invoices (wallet_address);
CREATE INDEX idx_invoices_created_status ON invoices (created_at, status);
CREATE INDEX idx_invoices_expires_at ON invoices (expires_at)
    WHERE status IN ('pending', 'awaiting_payment');
```

### Payment Events Table (per partition)

```sql
CREATE INDEX idx_pevents_invoice_id ON payment_events (invoice_id);
CREATE INDEX idx_pevents_tx_hash ON payment_events (tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX idx_pevents_type_created ON payment_events (event_type, created_at);
```

### Market Data Table (per partition/chunk)

```sql
-- TimescaleDB creates these automatically on hypertable columns
-- Additional composite index for common queries:
CREATE INDEX idx_market_exchange_symbol_ts ON market_data (exchange, symbol, timestamp DESC);
```

### AI Analysis Results Table

```sql
CREATE INDEX idx_ai_results_user_id ON ai_results (user_id);
CREATE INDEX idx_ai_results_created ON ai_results (created_at);
CREATE INDEX idx_ai_results_type ON ai_results (analysis_type);
CREATE INDEX idx_ai_results_symbol ON ai_results USING GIN ((metadata->'symbols'));
```

### Index Maintenance

```sql
-- Monitor unused indexes
SELECT schemaname, relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(i.indexrelid))
FROM pg_stat_user_indexes i
JOIN pg_index USING (indexrelid)
WHERE idx_scan = 0 AND NOT indisunique
ORDER BY pg_relation_size(i.indexrelid) DESC;

-- Monitor index bloat and schedule REINDEX during low-traffic windows
```

---

## 9. Schema Evolution and Migration Safety

### Migration Tool

Use **node-pg-migrate** or **Knex migrations** with these rules:

### Migration Safety Rules

1. **Never run DDL in transactions with DML** -- DDL acquires exclusive locks
2. **Add columns as nullable first**, backfill, then add NOT NULL constraint
3. **Create indexes CONCURRENTLY** to avoid table locks:
   ```sql
   CREATE INDEX CONCURRENTLY idx_name ON table (column);
   ```
4. **Never rename columns directly** -- add new column, migrate data, update code, drop old column
5. **Never drop columns in the same deploy** -- deploy code first, then drop column in next release
6. **Set statement_timeout for migrations:**
   ```sql
   SET statement_timeout = '30s';
   ```
7. **Test migrations against a copy of production data** before deploying

### Migration Checklist

```
[ ] Migration is backward-compatible with current code
[ ] No exclusive table locks on large tables
[ ] Indexes created CONCURRENTLY
[ ] Rollback migration exists and tested
[ ] Migration tested against production-size dataset
[ ] statement_timeout set
[ ] Deployment order documented (code first or migration first?)
```

### Schema Versioning

```sql
CREATE TABLE schema_migrations (
    version     BIGINT PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  TIMESTAMPTZ DEFAULT NOW(),
    checksum    TEXT NOT NULL,
    duration_ms INTEGER
);
```

---

## 10. Connection Pooling

### pgBouncer Configuration

```ini
[databases]
bitrium = host=pg-primary.internal port=5432 dbname=bitrium
bitrium_ro = host=pg-replica.internal port=5432 dbname=bitrium

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0

; Transaction pooling -- connections returned to pool after each transaction
pool_mode = transaction

; Pool sizing
default_pool_size = 25          ; per database/user pair
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3

; Limits
max_client_conn = 200           ; total client connections
max_db_connections = 50         ; max connections to PG

; Timeouts
server_idle_timeout = 300
client_idle_timeout = 600
query_timeout = 30
query_wait_timeout = 10

; Logging
log_connections = 1
log_disconnections = 1
stats_period = 60
```

### Connection Math

```
3 API workers x ~10 connections each  = 30 client connections
1 market-hub x ~5 connections         =  5 client connections
1 WS gateway x ~5 connections         =  5 client connections
1 cron worker x ~3 connections        =  3 client connections
                                       ----
Total client connections to pgBouncer  = 43

pgBouncer pool_size = 25 (actual PG connections)
This gives a 1.7:1 multiplexing ratio, which is conservative and safe.
```

### Application Configuration

```javascript
// Point application at pgBouncer, not directly at PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://user:pass@localhost:6432/bitrium',
  max: 10,                    // per-worker pool size (pgBouncer handles the rest)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

---

## 11. Backup and Recovery

### Backup Strategy (3-2-1 Rule)

| Method | Frequency | Retention | Storage |
|--------|-----------|-----------|---------|
| DO Managed PG automated backup | Daily | 7 days | DigitalOcean |
| pg_dump logical backup | Daily | 30 days | DO Spaces (S3-compatible) |
| WAL archiving (PITR) | Continuous | 7 days | DO Spaces |
| Monthly full backup | Monthly | 1 year | DO Spaces (different region) |

### Automated Backup Script

```bash
#!/bin/bash
# /opt/bitrium/scripts/backup-db.sh
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/pg_backups"
S3_BUCKET="s3://bitrium-backups/postgresql"

mkdir -p "$BACKUP_DIR"

# Logical backup with compression
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --file="$BACKUP_DIR/bitrium_$TIMESTAMP.dump"

# Upload to DO Spaces
s3cmd put "$BACKUP_DIR/bitrium_$TIMESTAMP.dump" \
  "$S3_BUCKET/daily/bitrium_$TIMESTAMP.dump"

# Cleanup local
rm "$BACKUP_DIR/bitrium_$TIMESTAMP.dump"

# Verify backup is valid
s3cmd get "$S3_BUCKET/daily/bitrium_$TIMESTAMP.dump" /tmp/verify.dump
pg_restore --list /tmp/verify.dump > /dev/null 2>&1
rm /tmp/verify.dump

echo "Backup completed and verified: bitrium_$TIMESTAMP.dump"
```

### Recovery Procedures

**Scenario 1: Accidental data deletion**
```bash
# Point-in-time recovery to moment before deletion
# 1. Create new PG instance from PITR backup
# 2. Extract affected tables
# 3. Restore to production
```

**Scenario 2: Complete database failure**
```bash
# 1. DO Managed PG handles automatic failover to standby
# 2. If managed PG unavailable, restore from latest pg_dump:
pg_restore --dbname=bitrium_new --jobs=4 bitrium_YYYYMMDD.dump
```

### Backup Verification

Run monthly restore tests to a staging database:

```bash
# Automated restore verification (monthly cron)
pg_restore --dbname=bitrium_restore_test --jobs=4 latest.dump
psql bitrium_restore_test -c "SELECT count(*) FROM users;"
psql bitrium_restore_test -c "SELECT count(*) FROM invoices;"
# Compare counts with production
```

---

## 12. Encryption at Rest

### PostgreSQL Level

- DigitalOcean Managed PostgreSQL encrypts data at rest by default (AES-256)
- This covers the full database, WAL files, and backups

### Application Level (API Keys)

See SECURITY-HARDENING.md for detailed API key encryption plan. Summary:

- Encrypt API keys with AES-256-GCM before storing in JSONB
- Encryption key stored in environment variable or secrets manager (not in database)
- Separate data encryption key (DEK) per user, wrapped with a master key (KEK)

### Backup Encryption

```bash
# Encrypt backups before uploading to DO Spaces
gpg --symmetric --cipher-algo AES256 \
  --passphrase-file /opt/bitrium/secrets/backup.key \
  bitrium_backup.dump
```

---

## 13. Monitoring and Alerting

### Key PostgreSQL Metrics

```yaml
# Prometheus postgres_exporter metrics to monitor
pg_stat_activity_count:
  warning: "> 80% of max_connections"
  critical: "> 95% of max_connections"

pg_stat_database_tup_fetched:
  description: "Rows fetched (read load indicator)"

pg_stat_database_tup_inserted:
  description: "Rows inserted (write load indicator)"

pg_stat_user_tables_n_dead_tup:
  warning: "> 10000 dead tuples on any table"
  description: "VACUUM needed"

pg_replication_lag_seconds:
  warning: "> 5 seconds"
  critical: "> 30 seconds"

pg_stat_bgwriter_buffers_backend:
  warning: "Increasing trend"
  description: "Shared buffers too small, direct backend writes"
```

### pgBouncer Metrics

```yaml
pgbouncer_pools_server_active:
  warning: "> 80% of max_db_connections"

pgbouncer_pools_client_waiting:
  warning: "> 0 for more than 10 seconds"
  critical: "> 10"

pgbouncer_stats_avg_query_time:
  warning: "> 100ms"
  critical: "> 500ms"
```

### Critical Alerts

| Alert | Condition | Action |
|-------|-----------|--------|
| Replication lag > 30s | pg_replication_lag > 30 | Check replica health, network |
| Connection pool exhausted | waiting_clients > 10 | Scale pool or investigate long queries |
| Disk usage > 80% | disk_used_pct > 80 | Archive old partitions, increase disk |
| Failed backup | backup script exit != 0 | Manual backup immediately |
| Long-running queries > 60s | query_duration > 60s | Investigate and terminate |
| Dead tuples > 100K | n_dead_tup > 100000 | Run manual VACUUM ANALYZE |

---

## Appendix: Recommended PostgreSQL Configuration

```ini
# For db-s-4vcpu-8gb (if self-managed)
shared_buffers = 2GB                 # 25% of RAM
effective_cache_size = 6GB           # 75% of RAM
work_mem = 16MB                      # per-sort operation
maintenance_work_mem = 512MB         # for VACUUM, CREATE INDEX

max_connections = 100                # pgBouncer handles client connections
max_wal_size = 2GB
min_wal_size = 512MB
checkpoint_completion_target = 0.9

# Logging
log_min_duration_statement = 200     # Log queries > 200ms
log_checkpoints = on
log_lock_waits = on
log_temp_files = 0                   # Log all temp file usage

# Autovacuum tuning
autovacuum_max_workers = 4
autovacuum_naptime = 30s
autovacuum_vacuum_cost_delay = 2ms
```
