# Bitrium Observability Architecture

> Status: Architecture Proposal
> Last Updated: 2026-04-04
> Priority: High -- you cannot improve what you cannot measure

---

## Table of Contents

1. [Observability Strategy](#observability-strategy)
2. [Structured Logging](#structured-logging)
3. [Metrics (Prometheus)](#metrics-prometheus)
4. [Distributed Tracing (OpenTelemetry)](#distributed-tracing)
5. [Error Monitoring (Sentry)](#error-monitoring)
6. [Grafana Dashboards](#grafana-dashboards)
7. [Alerting Strategy](#alerting-strategy)
8. [SLI/SLO Recommendations](#slislo-recommendations)
9. [Log Correlation](#log-correlation)
10. [Business Metrics](#business-metrics)
11. [Capacity Planning](#capacity-planning)
12. [Incident Response](#incident-response)
13. [Runbook Checklist](#runbook-checklist)

---

## 1. Observability Strategy

### Three Pillars

```
                    Observability
                    /     |     \
               Logs    Metrics   Traces
               (pino)  (Prom)   (OTel)
                 |        |        |
                 v        v        v
              Loki    Prometheus  Tempo/Jaeger
                 \        |        /
                  \       v       /
                   +-- Grafana --+
                        |
                     Alerting
                   (Alertmanager)
                        |
                 Slack / PagerDuty
```

### Tool Selection

| Concern | Tool | Rationale |
|---------|------|-----------|
| Structured logging | pino | Fastest Node.js JSON logger |
| Log aggregation | Grafana Loki | Lightweight, integrates with Grafana |
| Metrics | Prometheus | Industry standard, pull-based, free |
| Dashboards | Grafana | Unified view for all data sources |
| Tracing | OpenTelemetry + Tempo | Vendor-neutral, free |
| Error tracking | Sentry | Best-in-class for JS, free tier sufficient |
| Alerting | Alertmanager | Native Prometheus integration |
| Uptime monitoring | UptimeRobot or Grafana | External availability check |

### Deployment

For a single-team platform, run the observability stack on a dedicated small droplet ($24/mo) or alongside the staging environment:

```
Observability Droplet (s-2vcpu-4gb):
├── Prometheus (metrics storage)
├── Grafana (dashboards)
├── Loki (log aggregation)
├── Alertmanager (alert routing)
└── Tempo (trace storage, optional Phase 3)
```

---

## 2. Structured Logging

### Pino Configuration

```javascript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',

  // Structured fields on every log line
  base: {
    service: process.env.SERVICE_NAME || 'api',
    version: process.env.APP_VERSION,
    env: process.env.NODE_ENV,
    instance: process.env.HOSTNAME,
  },

  // Timestamp as ISO string for human readability + machine parsing
  timestamp: pino.stdTimeFunctions.isoTime,

  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.apiKey',
      'req.body.secret',
      'req.body.totpCode',
      '*.token',
      '*.refreshToken',
    ],
    censor: '[REDACTED]'
  },

  // Serializers for consistent field naming
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  }
});
```

### Log Format

```json
{
  "level": 30,
  "time": "2026-04-04T12:00:00.000Z",
  "service": "api",
  "version": "1.3.0",
  "env": "production",
  "instance": "api-1",
  "requestId": "req_abc123",
  "userId": 42,
  "msg": "Payment confirmed",
  "invoiceId": "inv_xyz",
  "amount": 20.0,
  "duration": 145
}
```

### Log Levels Usage

| Level | When to Use | Example |
|-------|------------|---------|
| fatal | Process must exit | Unrecoverable DB connection failure |
| error | Operation failed, needs attention | Payment processing error, AI provider timeout |
| warn | Unexpected but handled | Rate limit hit, fallback activated, near-limit |
| info | Normal business events | User login, payment created, subscription activated |
| debug | Development detail | SQL queries, cache hits/misses, WS messages |
| trace | Very verbose | Individual message serialization, loop iterations |

### Request Logging Middleware

```javascript
import { randomUUID } from 'crypto';

function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const start = process.hrtime.bigint();

  // Attach child logger with request context
  req.log = logger.child({ requestId, userId: req.user?.id });

  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e6; // ms
    req.log.info({
      msg: 'request completed',
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: Math.round(duration),
      contentLength: res.getHeader('content-length'),
    });
  });

  next();
}
```

### Shipping Logs to Loki

Use Promtail as a log shipper:

```yaml
# promtail-config.yaml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: bitrium
    static_configs:
      - targets: [localhost]
        labels:
          job: bitrium
          __path__: /var/log/bitrium/*.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            service: service
            requestId: requestId
      - labels:
          level:
          service:
```

---

## 3. Metrics (Prometheus)

### Application Metrics

```javascript
import client from 'prom-client';

// Enable default Node.js metrics
client.collectDefaultMetrics({ prefix: 'bitrium_' });

// HTTP request metrics
const httpRequestDuration = new client.Histogram({
  name: 'bitrium_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
});

const httpRequestsTotal = new client.Counter({
  name: 'bitrium_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// WebSocket metrics
const wsConnectionsActive = new client.Gauge({
  name: 'bitrium_ws_connections_active',
  help: 'Active WebSocket connections',
  labelNames: ['gateway']
});

const wsMessagesTotal = new client.Counter({
  name: 'bitrium_ws_messages_total',
  help: 'Total WebSocket messages',
  labelNames: ['direction', 'type']    // direction: in/out, type: data/subscribe/ping
});

// Payment metrics
const paymentInvoicesTotal = new client.Counter({
  name: 'bitrium_payment_invoices_total',
  help: 'Total invoices by status',
  labelNames: ['status', 'tier']
});

const paymentConfirmationDuration = new client.Histogram({
  name: 'bitrium_payment_confirmation_seconds',
  help: 'Time from payment detected to confirmed',
  buckets: [30, 60, 90, 120, 180, 300, 600]
});

const hotWalletBalance = new client.Gauge({
  name: 'bitrium_hot_wallet_balance_usdt',
  help: 'Hot wallet USDT balance'
});

// AI metrics
const aiRequestDuration = new client.Histogram({
  name: 'bitrium_ai_request_duration_seconds',
  help: 'AI provider request duration',
  labelNames: ['provider', 'model', 'task_type'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30]
});

const aiTokensTotal = new client.Counter({
  name: 'bitrium_ai_tokens_total',
  help: 'Total AI tokens used',
  labelNames: ['provider', 'model', 'type']    // type: prompt/completion
});

const aiCostTotal = new client.Counter({
  name: 'bitrium_ai_cost_usd_total',
  help: 'Total AI cost in USD',
  labelNames: ['provider', 'model', 'task_type']
});

const aiCacheHits = new client.Counter({
  name: 'bitrium_ai_cache_hits_total',
  help: 'AI response cache hits',
  labelNames: ['task_type']
});

// Database metrics
const dbQueryDuration = new client.Histogram({
  name: 'bitrium_db_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['operation'],    // select/insert/update/delete
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
});

const dbPoolActive = new client.Gauge({
  name: 'bitrium_db_pool_active_connections',
  help: 'Active database connections in pool'
});

// Market data metrics
const marketDataLatency = new client.Histogram({
  name: 'bitrium_market_data_latency_seconds',
  help: 'Latency from exchange to client delivery',
  labelNames: ['exchange'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]
});

const marketDataMessagesTotal = new client.Counter({
  name: 'bitrium_market_data_messages_total',
  help: 'Market data messages processed',
  labelNames: ['exchange', 'type']
});

// Auth metrics
const authAttemptsTotal = new client.Counter({
  name: 'bitrium_auth_attempts_total',
  help: 'Authentication attempts',
  labelNames: ['result']    // success/failure/2fa_required
});

const activeSessionsGauge = new client.Gauge({
  name: 'bitrium_active_sessions',
  help: 'Active user sessions'
});
```

### Metrics Endpoint

```javascript
app.get('/metrics', async (req, res) => {
  // Restrict to internal network or Prometheus scraper
  if (!isInternalRequest(req)) {
    return res.status(403).end();
  }
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'bitrium-api'
    static_configs:
      - targets: ['api-1:3000', 'api-2:3000', 'api-3:3000']
    metrics_path: /metrics

  - job_name: 'bitrium-ws-gateway'
    static_configs:
      - targets: ['ws-1:3001', 'ws-2:3001']

  - job_name: 'bitrium-market-hub'
    static_configs:
      - targets: ['market-hub:3002']

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'nginx-exporter'
    static_configs:
      - targets: ['nginx-exporter:9113']
```

---

## 4. Distributed Tracing

### OpenTelemetry Setup

```javascript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';

const sdk = new NodeSDK({
  serviceName: process.env.SERVICE_NAME || 'bitrium-api',
  traceExporter: new OTLPTraceExporter({
    url: 'http://tempo:4318/v1/traces',
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PgInstrumentation(),
    new IORedisInstrumentation(),
  ],
});

sdk.start();
```

### Custom Spans for Business Operations

```javascript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('bitrium-payment');

async function processPayment(invoiceId, txData) {
  return tracer.startActiveSpan('payment.process', async (span) => {
    span.setAttribute('invoice.id', invoiceId);
    span.setAttribute('payment.amount', txData.amount);
    span.setAttribute('payment.network', 'tron');

    try {
      // Verify transaction
      await tracer.startActiveSpan('payment.verify_tx', async (verifySpan) => {
        const result = await verifyTransaction(txData.txHash);
        verifySpan.setAttribute('tx.confirmations', result.confirmations);
        verifySpan.end();
      });

      // Update database
      await tracer.startActiveSpan('payment.update_db', async (dbSpan) => {
        await transitionInvoiceState(invoiceId, 'confirming', 'paid', txData);
        dbSpan.end();
      });

      // Activate subscription
      await tracer.startActiveSpan('payment.activate_subscription', async (subSpan) => {
        await activateSubscription(invoiceId);
        subSpan.end();
      });

      span.setStatus({ code: trace.SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({ code: trace.SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

---

## 5. Error Monitoring

### Sentry Configuration

```javascript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,
  tracesSampleRate: 0.1,        // 10% of transactions for performance
  profilesSampleRate: 0.05,     // 5% for profiling

  // Only report errors, not warnings
  beforeSend(event) {
    // Filter out expected errors
    if (event.exception?.values?.[0]?.type === 'RateLimitError') {
      return null;
    }
    return event;
  },

  // Scrub sensitive data
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === 'http' && breadcrumb.data?.url?.includes('/auth')) {
      delete breadcrumb.data.body;
    }
    return breadcrumb;
  },
});

// Express error handler
app.use(Sentry.Handlers.errorHandler({
  shouldHandleError(error) {
    // Report 5xx errors and unhandled errors
    return !error.statusCode || error.statusCode >= 500;
  }
}));
```

### Error Classification

| Category | Alert | Examples |
|----------|-------|---------|
| Infrastructure | Immediate | DB connection failure, Redis down, OOM |
| Payment | Immediate | Payment processing failure, chain monitoring gap |
| Security | Immediate | Auth bypass attempt, injection detected |
| AI Provider | Warning | Provider timeout, all fallbacks failed |
| User Error | No alert | Invalid input, 4xx errors |
| Rate Limit | No alert (metric only) | Expected behavior |

---

## 6. Grafana Dashboards

### Dashboard Groups

#### 1. Platform Overview Dashboard

```
Row 1: Key Metrics (stat panels)
  - Active Users (last 24h)
  - Revenue (last 30d)
  - Error Rate (last 1h)
  - API Latency p99

Row 2: Request Rate & Latency
  - HTTP requests/sec by status code (time series)
  - Response time percentiles (p50, p90, p99)
  - Error rate percentage

Row 3: Infrastructure Health
  - CPU usage per instance
  - Memory usage per instance
  - Disk I/O
  - Network throughput
```

#### 2. API Performance Dashboard

```
Row 1: Request Rates
  - Requests/sec by endpoint
  - Slow endpoints (>1s) table
  - 5xx error rate by endpoint

Row 2: Latency
  - Latency heatmap
  - p50/p90/p99 by endpoint
  - Database query duration

Row 3: Dependencies
  - PostgreSQL connections active/idle
  - Redis operations/sec
  - Redis memory usage
  - Connection pool utilization
```

#### 3. WebSocket Dashboard

```
Row 1: Connections
  - Active connections (gauge)
  - Connections rate (new/closed per minute)
  - Connections by tier

Row 2: Message Flow
  - Messages/sec by direction (in/out)
  - Messages by channel type
  - Subscriptions by channel

Row 3: Health
  - Message latency (exchange -> client)
  - Backpressure events
  - Authentication failures
  - Rate limit hits
```

#### 4. Payment Dashboard

```
Row 1: Revenue
  - Daily revenue (bar chart)
  - Invoices by status (pie chart)
  - Conversion funnel (created -> paid)

Row 2: Payment Health
  - Confirmation time histogram
  - Expired invoices rate
  - Underpaid/overpaid count
  - Pending refunds

Row 3: Wallet
  - Hot wallet balance
  - Daily inflow/outflow
  - Network fee costs
```

#### 5. AI Engine Dashboard

```
Row 1: Usage
  - Requests/min by model
  - Cache hit ratio
  - Tokens consumed by model

Row 2: Cost
  - Daily cost by provider (stacked bar)
  - Cost per user (top 10)
  - Cost per task type

Row 3: Quality
  - Latency by model (percentiles)
  - Circuit breaker status
  - Validation failures
  - Fallback activations
```

#### 6. Security Dashboard

```
Row 1: Authentication
  - Login attempts (success/failure)
  - 2FA usage rate
  - Active sessions

Row 2: Threats
  - Rate limit hits by endpoint
  - Blocked IPs
  - Failed auth by IP (top 10)
  - Anomaly detections

Row 3: Audit
  - Admin actions (timeline)
  - Sensitive operations count
  - API key access log
```

---

## 7. Alerting Strategy

### Alert Severity Levels

| Level | Response Time | Notification Channel | Examples |
|-------|-------------|---------------------|---------|
| P1 Critical | Immediate | PagerDuty + Slack + SMS | Service down, data loss, security breach |
| P2 High | < 30 min | Slack #alerts | Degraded performance, payment failure |
| P3 Medium | < 4 hours | Slack #alerts | High error rate, resource warnings |
| P4 Low | Next business day | Slack #monitoring | Trends, capacity planning |

### Critical Alerts (P1)

```yaml
# alertmanager-rules.yml
groups:
  - name: critical
    rules:
      - alert: ServiceDown
        expr: up{job="bitrium-api"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "API service is down on {{ $labels.instance }}"

      - alert: HighErrorRate
        expr: |
          sum(rate(bitrium_http_requests_total{status_code=~"5.."}[5m]))
          / sum(rate(bitrium_http_requests_total[5m])) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error rate above 5% for 2 minutes"

      - alert: DatabaseDown
        expr: pg_up == 0
        for: 30s
        labels:
          severity: critical

      - alert: HotWalletLow
        expr: bitrium_hot_wallet_balance_usdt < 500
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Hot wallet balance below $500"

      - alert: PaymentMonitoringGap
        expr: |
          time() - max(bitrium_market_data_messages_total) > 300
        labels:
          severity: critical
        annotations:
          summary: "No blockchain data processed in 5 minutes"

      - alert: LedgerImbalance
        expr: bitrium_ledger_imbalance != 0
        for: 1m
        labels:
          severity: critical
```

### High Alerts (P2)

```yaml
      - alert: HighLatency
        expr: |
          histogram_quantile(0.99, rate(bitrium_http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: high
        annotations:
          summary: "API p99 latency above 2 seconds"

      - alert: PaymentConfirmationSlow
        expr: |
          bitrium_payment_stuck_confirming_count > 0
        for: 30m
        labels:
          severity: high

      - alert: AIAllProvidersFailing
        expr: |
          sum(bitrium_ai_circuit_breaker_state) == count(bitrium_ai_circuit_breaker_state) * 2
        for: 2m
        labels:
          severity: high
        annotations:
          summary: "All AI providers have open circuit breakers"

      - alert: ReplicationLag
        expr: pg_replication_lag_seconds > 30
        for: 2m
        labels:
          severity: high

      - alert: DiskUsageHigh
        expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.15
        for: 10m
        labels:
          severity: high
```

### Medium Alerts (P3)

```yaml
      - alert: HighMemoryUsage
        expr: node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes < 0.15
        for: 10m
        labels:
          severity: medium

      - alert: AIHighCost
        expr: |
          sum(increase(bitrium_ai_cost_usd_total[24h])) > 200
        labels:
          severity: medium
        annotations:
          summary: "Daily AI cost exceeded $200"

      - alert: HighExpiredInvoiceRate
        expr: |
          rate(bitrium_payment_invoices_total{status="expired"}[1h])
          / rate(bitrium_payment_invoices_total[1h]) > 0.5
        for: 30m
        labels:
          severity: medium

      - alert: ConnectionPoolSaturation
        expr: bitrium_db_pool_active_connections / bitrium_db_pool_max_connections > 0.8
        for: 5m
        labels:
          severity: medium
```

---

## 8. SLI/SLO Recommendations

### Service Level Indicators

| SLI | Measurement | Target |
|-----|-------------|--------|
| Availability | Successful responses / total responses | 99.9% |
| API Latency | p99 response time | < 500ms |
| WS Latency | p99 exchange-to-client | < 200ms |
| Payment Success | Paid invoices / non-cancelled invoices | > 95% |
| AI Availability | Successful AI responses / total AI requests | > 99% |
| Data Freshness | Time since last market data update | < 10s |

### Service Level Objectives

| Service | SLO | Error Budget (30d) | Measurement Window |
|---------|-----|-------------------|-------------------|
| API | 99.9% availability | 43 min downtime | 30 days rolling |
| WebSocket | 99.5% availability | 3.6 hr downtime | 30 days rolling |
| Payments | 99.99% correctness | 0 incorrect payments | Forever |
| AI Engine | 99% availability | 7.2 hr downtime | 30 days rolling |

### Error Budget Policy

- If error budget is consumed >50%, freeze non-critical deployments
- If error budget is consumed >80%, focus exclusively on reliability work
- If error budget is exhausted, halt all feature work until reliability is restored

---

## 9. Log Correlation

### Correlation Strategy

Every request generates a `requestId` that flows through all systems:

```
HTTP Request (requestId: req_abc)
  -> Express middleware (log with requestId)
    -> Database query (log with requestId)
    -> Redis operation (log with requestId)
    -> AI provider call (log with requestId)
    -> WebSocket broadcast (log with requestId)
```

### Implementation

```javascript
import { AsyncLocalStorage } from 'async_hooks';

const asyncLocalStorage = new AsyncLocalStorage();

// Middleware: create context for each request
function correlationMiddleware(req, res, next) {
  const context = {
    requestId: req.requestId,
    userId: req.user?.id,
    traceId: req.headers['traceparent']?.split('-')[1],
  };

  asyncLocalStorage.run(context, () => next());
}

// Helper: get current context
function getContext() {
  return asyncLocalStorage.getStore() || {};
}

// Usage in any module
function someBusinessLogic() {
  const { requestId, userId } = getContext();
  logger.info({ requestId, userId, msg: 'Processing business logic' });
}
```

### Grafana: From Metric to Log to Trace

```
1. Grafana dashboard shows spike in error rate (metric)
2. Click on spike -> shows timeframe
3. Link to Loki: query logs for that timeframe with level=error
4. Log entry contains traceId
5. Link to Tempo: view full trace with that traceId
6. Trace shows which span failed and why
```

Configuration in Grafana datasources:

```yaml
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090

  - name: Loki
    type: loki
    url: http://loki:3100
    jsonData:
      derivedFields:
        - name: traceId
          matcherRegex: '"traceId":"(\w+)"'
          url: '$${__value.raw}'
          datasourceUid: tempo

  - name: Tempo
    type: tempo
    url: http://tempo:3200
```

---

## 10. Business Metrics

### Revenue and Growth

```
bitrium_active_subscriptions{tier="explorer|trader|titan"}
bitrium_daily_revenue_usdt
bitrium_monthly_recurring_revenue_usdt
bitrium_user_signups_total
bitrium_subscription_churn_total{tier}
bitrium_trial_to_paid_conversions_total
```

### User Engagement

```
bitrium_daily_active_users
bitrium_api_calls_per_user{tier, quantile="0.5|0.9"}
bitrium_ai_analyses_per_user{tier}
bitrium_ws_session_duration_seconds{tier, quantile="0.5|0.9"}
bitrium_feature_usage_total{feature="alerts|portfolio|analysis|screening"}
```

### Platform Health (Business View)

```
bitrium_invoice_conversion_rate          -- paid / created
bitrium_payment_time_to_complete_seconds -- from create to paid
bitrium_support_tickets_total            -- if applicable
bitrium_user_retention_rate_30d
```

---

## 11. Capacity Planning

### Resource Tracking

| Metric | Current | Alert Threshold | Scale Action |
|--------|---------|-----------------|-------------|
| CPU usage (avg) | 30% | 70% | Add instance |
| Memory usage | 60% | 85% | Resize or add instance |
| Disk usage | 40% | 80% | Expand disk or archive data |
| DB connections | 43/100 | 80/100 | Resize pool or add pgBouncer |
| Redis memory | 500MB/2GB | 1.6GB/2GB | Resize |
| WS connections | 200 | 50K/gateway | Add gateway |

### Growth Projections

```
Current: 100 users, ~200 WS connections, ~50 req/s
3 months: 500 users -> need Phase 2 infrastructure
6 months: 2000 users -> need Phase 3
12 months: 5000 users -> need Phase 3 optimized
24 months: 10000+ users -> evaluate Phase 4/5
```

### Capacity Review Schedule

- Weekly: Check dashboard trends
- Monthly: Review resource utilization vs growth
- Quarterly: Capacity planning meeting, budget review

---

## 12. Incident Response

### Incident Flow

```
Alert fires (Alertmanager)
    |
    v
Notification sent (Slack/PagerDuty)
    |
    v
On-call acknowledges (< 5 min for P1)
    |
    v
Assess severity and scope
    |
    v
Communicate status (status page, Slack)
    |
    v
Investigate (dashboards, logs, traces)
    |
    v
Mitigate (rollback, scale, restart)
    |
    v
Resolve and verify
    |
    v
Post-mortem (within 48 hours for P1/P2)
```

### Incident Communication Template

```
INCIDENT: [Brief description]
SEVERITY: P1/P2/P3/P4
DETECTED: [Timestamp]
IMPACT: [What users are affected and how]
STATUS: Investigating / Mitigating / Resolved
NEXT UPDATE: [Timestamp, typically 30 min for P1]
```

---

## 13. Runbook Checklist

### API High Latency

```
1. Check Grafana API Performance dashboard
2. Identify slow endpoints (sort by p99)
3. Check database query latency
   - If DB slow: check pg_stat_activity for long queries
   - If pool exhausted: check connection count, restart pgBouncer
4. Check Redis latency
   - If Redis slow: check memory usage, check for large keys
5. Check CPU/memory of API instances
   - If high: check for memory leaks (heap dump)
6. Check recent deployments (possible regression)
7. If no root cause found: add more API instances temporarily
```

### Database Connection Exhaustion

```
1. Check pgBouncer stats: SHOW POOLS
2. Check for long-running queries: SELECT * FROM pg_stat_activity WHERE state != 'idle'
3. Kill long-running queries if safe: SELECT pg_terminate_backend(pid)
4. Check for connection leaks in application code
5. Increase pool_size in pgBouncer if consistently at limit
6. Review application pool settings
```

### Payment Processing Failure

```
1. Check Payment dashboard for specific failure type
2. Check TRON network status (is the chain operating normally?)
3. Check hot wallet balance (sufficient for refunds?)
4. Check blockchain monitoring service (is it running?)
5. Check for stuck invoices in 'confirming' state
6. Manual verification: use tronscan.org to verify transactions
7. If system error: check Sentry for stack traces
8. If chain issue: wait and monitor, notify affected users
```

### AI Provider Outage

```
1. Check AI Engine dashboard for circuit breaker status
2. Identify which provider(s) are failing
3. Check provider status pages (status.openai.com, etc.)
4. Verify fallback chain is activating correctly
5. If all providers down:
   a. Check network connectivity from our servers
   b. Enable cached-only mode (serve cached results, queue new requests)
   c. Notify users of degraded AI functionality
6. Monitor for recovery, reset circuit breakers manually if needed
```

### High Memory Usage

```
1. Check which process is consuming memory (top, htop)
2. If Node.js:
   a. Check for memory leaks: take heap snapshot
   b. Check WS connection count (each connection uses memory)
   c. Check Redis client buffer sizes
   d. Restart process if immediate relief needed
3. If PostgreSQL:
   a. Check work_mem and shared_buffers settings
   b. Check for bloated tables (VACUUM needed?)
   c. Check for large temporary tables from complex queries
4. If Redis:
   a. Check memory usage: INFO memory
   b. Identify large keys: redis-cli --bigkeys
   c. Review TTL policies
```

---

## Appendix: Quick Reference

### Grafana URLs (to configure)

```
Platform Overview:  /d/platform-overview
API Performance:    /d/api-performance
WebSocket:          /d/ws-dashboard
Payments:           /d/payments
AI Engine:          /d/ai-engine
Security:           /d/security
Infrastructure:     /d/infrastructure
```

### Log Queries (Loki)

```
# All errors in last hour
{service="api"} |= "error" | json | level="50"

# Payment events
{service="api"} | json | msg=~"payment.*"

# Slow queries (>500ms)
{service="api"} | json | duration > 500

# Specific user activity
{service="api"} | json | userId="42"

# AI provider failures
{service="api"} | json | msg=~"AI provider failed.*"
```
