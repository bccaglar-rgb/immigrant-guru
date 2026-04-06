# Bitrium Real-Time WebSocket Architecture

> Status: Architecture Proposal
> Last Updated: 2026-04-04
> Priority: High -- WebSocket is the primary data delivery mechanism

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Target Architecture](#target-architecture)
3. [Stack Recommendation](#stack-recommendation)
4. [Channel and Topic Design](#channel-and-topic-design)
5. [Authentication Model](#authentication-model)
6. [Message Protocol](#message-protocol)
7. [Heartbeat and Connection Health](#heartbeat-and-connection-health)
8. [Reconnection Strategy](#reconnection-strategy)
9. [Horizontal Scaling](#horizontal-scaling)
10. [Abuse Prevention](#abuse-prevention)
11. [Observability](#observability)
12. [Migration Path](#migration-path)

---

## 1. Current State Analysis

### Problems with Current Setup

- WS connections are served from the same Express process that handles REST API requests
- A spike in WS connections degrades REST API response times
- No structured channel/topic model -- clients subscribe with ad-hoc event names
- No backpressure mechanism for slow consumers
- Reconnection is fully client-driven with no server-assisted resync
- No per-user connection limits; a single user can open unlimited connections
- Market data fan-out duplicates serialization per connection

### Architecture Constraint

The platform aggregates market data from four exchanges (Binance, Bybit, OKX, Gate.io) via market-hub, then distributes it to connected clients. This is a read-heavy, fan-out pattern that benefits from a dedicated process.

---

## 2. Target Architecture

```
                           +------------------+
                           |   Nginx / LB     |
                           | (path routing)   |
                           +--------+---------+
                                    |
                     +--------------+--------------+
                     |                             |
              /api/* routes                 /ws/* routes
                     |                             |
           +---------+--------+         +----------+---------+
           |  API Server (x3) |         |  WS Gateway (x2)  |
           |  Express + PM2   |         |  uWebSockets.js   |
           +---------+--------+         +----------+---------+
                     |                             |
                     +--------+   +----------------+
                              |   |
                        +-----+---+------+
                        |  Redis Pub/Sub |
                        |  (adapter)     |
                        +-----+----------+
                              |
                     +--------+--------+
                     |  market-hub     |
                     |  (data ingest)  |
                     +--------+--------+
                              |
              +-------+-------+-------+-------+
              |       |       |       |       |
           Binance  Bybit   OKX   Gate.io
```

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Dedicated WS process | Yes | Isolate long-lived connections from request/response cycle |
| Library | uWebSockets.js | 10x throughput over ws/socket.io per benchmark |
| Transport | Raw WebSocket | No need for socket.io's overhead; clients are SPAs |
| Serialization | JSON (v1), MessagePack (v2) | JSON first for debuggability, MessagePack later for bandwidth |
| Fan-out broker | Redis Pub/Sub | Already in stack, sufficient for current scale |

---

## 3. Stack Recommendation

### uWebSockets.js

**Why uWebSockets.js over alternatives:**

| Library | Connections/core | Latency p99 | Memory/conn |
|---------|-----------------|-------------|-------------|
| ws | ~10K | 12ms | ~4KB |
| socket.io | ~5K | 25ms | ~8KB |
| uWebSockets.js | ~100K | 2ms | ~0.5KB |

**Implementation skeleton:**

```javascript
import uWS from 'uWebSockets.js';

const app = uWS.App();

app.ws('/ws/v1', {
  compression: uWS.SHARED_COMPRESSOR,
  maxPayloadLength: 16 * 1024,        // 16KB max message
  idleTimeout: 120,                     // seconds
  maxBackpressure: 1024 * 1024,        // 1MB backpressure limit

  upgrade: (res, req, context) => {
    // Extract JWT from query param or header before upgrade
    const token = req.getQuery('token');
    // Verify token, attach user context
  },

  open: (ws) => {
    // Register connection, start heartbeat
  },

  message: (ws, message, isBinary) => {
    // Route to handler based on message type
  },

  drain: (ws) => {
    // Backpressure relieved -- resume sending
  },

  close: (ws, code, message) => {
    // Cleanup subscriptions, update connection count
  }
});
```

---

## 4. Channel and Topic Design

### Channel Hierarchy

```
market:{exchange}:{symbol}:{dataType}
  market:binance:BTCUSDT:ticker
  market:binance:BTCUSDT:kline:1m
  market:binance:BTCUSDT:depth
  market:*:BTCUSDT:ticker           (aggregated cross-exchange)

user:{userId}:{topic}
  user:123:notifications
  user:123:alerts
  user:123:portfolio

system:{topic}
  system:status
  system:maintenance
```

### Subscription Management

```javascript
// Client sends
{ "op": "subscribe", "channels": ["market:binance:BTCUSDT:ticker"] }

// Server confirms
{ "op": "subscribed", "channel": "market:binance:BTCUSDT:ticker", "id": "sub_abc123" }

// Data flows
{ "ch": "market:binance:BTCUSDT:ticker", "ts": 1712188800000, "d": { ... } }
```

### Subscription Limits by Tier

| Tier | Max Subscriptions | Max Connections | Throttle |
|------|-------------------|-----------------|----------|
| Explorer ($10) | 10 | 2 | 1 msg/sec per channel |
| Trader ($20) | 25 | 3 | 5 msg/sec per channel |
| Titan ($30) | 50 | 5 | 10 msg/sec per channel |
| Admin | Unlimited | 10 | No throttle |

---

## 5. Authentication Model

### Connection Authentication Flow

```
1. Client obtains short-lived WS ticket via REST:
   POST /api/v1/auth/ws-ticket
   Authorization: Bearer <JWT>
   Response: { "ticket": "wst_xxx", "expiresIn": 30 }

2. Client connects with ticket:
   ws://host/ws/v1?ticket=wst_xxx

3. Server validates ticket (single-use, stored in Redis with 30s TTL)

4. On validation success:
   - Associate connection with userId and tier
   - Delete ticket from Redis (one-time use)
   - Send AUTH_OK message

5. On validation failure:
   - Close connection with 4001 (Unauthorized)
```

### Why Tickets Instead of JWT in URL

- JWTs are long and may exceed URL length limits
- JWTs in URLs appear in access logs, proxies, and referrer headers
- Tickets are single-use and short-lived (30 seconds)
- Ticket validation is an O(1) Redis lookup

### Session Binding

- Each WS connection is bound to the JWT session that created the ticket
- If the REST session is revoked (logout, password change), broadcast disconnect to all WS connections for that user
- Redis key: `ws:session:{sessionId}` -> set of connection IDs

---

## 6. Message Protocol

### Envelope Format

```javascript
// Client -> Server
{
  "op": string,        // operation: subscribe, unsubscribe, ping, resync
  "id": string,        // client-generated request ID for correlation
  "d": object          // operation-specific payload
}

// Server -> Client
{
  "op": string,        // operation: data, subscribed, unsubscribed, pong, error, auth_ok
  "ch": string,        // channel (for data messages)
  "ts": number,        // server timestamp (epoch ms)
  "id": string,        // correlation ID (for request/response pairs)
  "d": object          // payload
}
```

### Event Naming Convention

| Event | Direction | Description |
|-------|-----------|-------------|
| `subscribe` | C->S | Subscribe to channel(s) |
| `unsubscribe` | C->S | Unsubscribe from channel(s) |
| `ping` | C->S | Client heartbeat |
| `resync` | C->S | Request full state after reconnect |
| `data` | S->C | Channel data update |
| `subscribed` | S->C | Subscription confirmation |
| `unsubscribed` | S->C | Unsubscription confirmation |
| `pong` | S->C | Server heartbeat response |
| `error` | S->C | Error notification |
| `auth_ok` | S->C | Authentication successful |
| `auth_fail` | S->C | Authentication failed |
| `maintenance` | S->C | Upcoming maintenance window |

### Error Codes

| Code | Meaning |
|------|---------|
| 4001 | Unauthorized |
| 4002 | Subscription limit exceeded |
| 4003 | Rate limited |
| 4004 | Invalid channel |
| 4005 | Connection limit exceeded |
| 4008 | Heartbeat timeout |
| 4010 | Session revoked |

---

## 7. Heartbeat and Connection Health

### Bidirectional Heartbeat

```
Client sends:  { "op": "ping", "ts": 1712188800000 }
Server replies: { "op": "pong", "ts": 1712188800050 }
```

- **Client ping interval:** 30 seconds
- **Server timeout:** 90 seconds (3 missed pings)
- **Server-initiated ping:** every 45 seconds (uWS idleTimeout handles this)

### Connection States

```
CONNECTING -> AUTHENTICATING -> ACTIVE -> DRAINING -> CLOSED
                                  |
                                  +-> SUSPENDED (backpressure)
```

### Backpressure Handling

When `ws.getBufferedAmount() > maxBackpressure`:

1. Stop sending non-critical data to this connection
2. Queue critical messages (alerts, auth events) up to a secondary limit
3. If backpressure persists for >10 seconds, send a warning and close
4. The `drain` callback resumes normal delivery

---

## 8. Reconnection Strategy

### Client-Side Reconnection

```javascript
const RECONNECT_SCHEDULE = [0, 1000, 2000, 5000, 10000, 30000, 60000];

class ReconnectManager {
  attempt = 0;

  getDelay() {
    const base = RECONNECT_SCHEDULE[Math.min(this.attempt, RECONNECT_SCHEDULE.length - 1)];
    const jitter = Math.random() * 1000;
    return base + jitter;
  }

  onDisconnect(code) {
    if (code === 4010) return; // Session revoked, don't reconnect
    setTimeout(() => this.connect(), this.getDelay());
    this.attempt++;
  }

  onConnect() {
    this.attempt = 0;
    this.resync();
  }
}
```

### Server-Assisted Resync

After reconnection, the client sends a resync request:

```javascript
{ "op": "resync", "d": { "channels": ["market:binance:BTCUSDT:ticker"], "lastTs": 1712188800000 } }
```

The server responds with:

1. Current snapshot for each subscribed channel
2. Any missed messages buffered in Redis (last 60 seconds)
3. A `resync_complete` event to signal the client can trust incremental updates again

### Resync Buffer

- Redis stores the last 60 seconds of messages per channel in a sorted set (score = timestamp)
- `ZRANGEBYSCORE market:binance:BTCUSDT:ticker {lastTs} +inf`
- Buffer TTL: 120 seconds
- Max buffer size per channel: 1000 messages

---

## 9. Horizontal Scaling

### Redis Pub/Sub Adapter

```
WS Gateway 1  <-->  Redis Pub/Sub  <-->  WS Gateway 2
                         ^
                         |
                    market-hub
                    (publisher)
```

- market-hub publishes to Redis channels matching the topic hierarchy
- Each WS gateway subscribes to Redis channels matching its active client subscriptions
- Use Redis pattern subscriptions sparingly (prefer explicit channel subscriptions)

### Sticky Sessions

- Not required: Redis adapter ensures all gateways receive all relevant messages
- Nginx upstream: `least_conn` balancing for WS upgrades
- Connection state is local to the gateway instance

### Extracting market-hub Fan-out

Current: market-hub -> direct to client connections
Target: market-hub -> Redis Pub/Sub -> WS gateways -> clients

This decouples data ingestion from client delivery and allows independent scaling.

### Scaling Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| Connections per gateway | > 50K | Add gateway instance |
| Message latency p99 | > 50ms | Add gateway or optimize serialization |
| Redis Pub/Sub lag | > 100ms | Evaluate Redis Cluster or NATS |
| CPU per gateway | > 70% | Add gateway instance |

---

## 10. Abuse Prevention

### Connection-Level

- Max connections per user (tier-based, see section 4)
- Max connections per IP: 20 (across all users)
- Connection rate limit: 5 new connections per minute per IP
- Ban IPs with >100 failed auth attempts in 5 minutes

### Message-Level

- Max message size: 16KB
- Max messages per second per connection: 20
- Max subscribe operations per minute: 60
- Invalid message counter: close connection after 10 invalid messages

### Channel-Level

- Subscription limits per tier (see section 4)
- Wildcard subscriptions disabled for non-admin users
- Channel existence validation before subscription acceptance

### Implementation

```javascript
class RateLimiter {
  constructor(maxPerWindow, windowMs) {
    this.max = maxPerWindow;
    this.windowMs = windowMs;
    this.counts = new Map(); // key -> { count, resetAt }
  }

  check(key) {
    const now = Date.now();
    const entry = this.counts.get(key);
    if (!entry || now > entry.resetAt) {
      this.counts.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count++;
    return true;
  }
}
```

---

## 11. Observability

### Metrics to Export (Prometheus)

```
# Connection metrics
ws_connections_active{gateway="gw1"}
ws_connections_total{gateway="gw1", status="open|close|reject"}
ws_auth_attempts_total{result="success|failure"}

# Message metrics
ws_messages_received_total{op="subscribe|unsubscribe|ping"}
ws_messages_sent_total{op="data|pong|error"}
ws_message_bytes_sent_total{channel_type="market|user|system"}

# Subscription metrics
ws_subscriptions_active{channel_type="market|user|system"}

# Performance metrics
ws_message_latency_seconds{quantile="0.5|0.9|0.99"}
ws_backpressure_events_total
ws_resync_requests_total

# Abuse metrics
ws_rate_limited_total{type="connection|message|subscription"}
ws_connections_rejected_total{reason="auth|limit|banned"}
```

### Logging

Every connection lifecycle event should be logged with structured JSON:

```json
{
  "event": "ws_connect",
  "userId": "123",
  "tier": "trader",
  "ip": "x.x.x.x",
  "gateway": "gw1",
  "connId": "conn_abc",
  "timestamp": "2026-04-04T12:00:00Z"
}
```

### Dashboards

- **Gateway Overview:** active connections, message throughput, latency p50/p99
- **User Activity:** connections by tier, subscriptions by channel type
- **Abuse Monitor:** rate limit hits, rejected connections, banned IPs
- **Data Pipeline:** market-hub -> Redis -> gateway latency chain

---

## 12. Migration Path

### Phase 1: Extract WS to Dedicated Process

1. Create new `ws-gateway` service using uWebSockets.js
2. Configure Nginx to route `/ws/*` to the new service
3. Keep REST API untouched
4. Both old and new WS endpoints active during transition
5. Client feature flag to opt into new endpoint
6. Monitor for 2 weeks, then remove old WS from API server

### Phase 2: Implement Channel Model

1. Define channel schema and subscription protocol
2. Update client WS manager to use new protocol
3. Implement server-side subscription management
4. Add tier-based limits

### Phase 3: Add Redis Adapter

1. market-hub publishes to Redis Pub/Sub instead of direct connections
2. WS gateway subscribes to Redis and fans out to clients
3. Enable resync buffer in Redis
4. Test with second gateway instance

### Phase 4: Performance Optimization

1. Add MessagePack serialization (optional per client via `?format=msgpack`)
2. Implement delta compression for market data
3. Add per-channel throttling for lower tiers
4. Benchmark and tune uWS parameters

---

## Appendix: Capacity Estimates

| Scenario | Connections | Messages/sec | Bandwidth |
|----------|------------|--------------|-----------|
| Current (100 users) | ~200 | ~2,000 | ~5 MB/s |
| Growth (1,000 users) | ~2,000 | ~20,000 | ~50 MB/s |
| Scale (10,000 users) | ~20,000 | ~200,000 | ~500 MB/s |

A single uWebSockets.js process on a 4-core droplet can handle the 10,000-user scenario. Redis Pub/Sub can handle ~1M messages/sec on a dedicated instance. The architecture supports horizontal scaling well beyond these estimates.
