# Bitrium Exchange Trading Platform - Architecture Report
**Tarih:** 2026-03-18
**Hedef:** 1000+ kullanici, coklu borsa, canli emir yonetimi

---

## 1. MEVCUT DURUM OZETI

Backend'de **23 dosya, 14+ tablo, 12 faz** tamamlanmis durumda. Asagida ne var, ne eksik, net harita:

### TAMAMLANAN MODÜLLER (Production-Ready)

| Modul | Dosya | Satir | Durum |
|-------|-------|-------|-------|
| Exchange Manager | exchangeManager/ExchangeManager.ts | 536 | COMPLETE |
| Intent Factory | exchangeCore/intentFactory.ts | 75 | COMPLETE |
| Kill Switch (5 seviye) | exchangeCore/killSwitch.ts | 149 | COMPLETE |
| Risk Gate | exchangeCore/riskGate.ts | 181 | COMPLETE |
| Policy Engine (AI vs Manual) | exchangeCore/policyEngine.ts | 220 | COMPLETE |
| Symbol Registry | exchangeCore/symbolRegistry.ts | 214 | COMPLETE |
| Order Normalizer | exchangeCore/orderNormalizer.ts | 189 | COMPLETE |
| Rate Limiter (4 seviye) | exchangeCore/exchangeRateLimiter.ts | 147 | COMPLETE |
| Circuit Breaker | exchangeCore/circuitBreaker.ts | 178 | COMPLETE |
| API Vault (sifreleme + audit) | exchangeCore/apiVault.ts | 320 | COMPLETE |
| Private Stream Manager | exchangeCore/privateStreamManager.ts | 326 | COMPLETE |
| Order Reconciler (30s tick) | exchangeCore/reconciler.ts | 299 | COMPLETE |
| Fill Reconciler | exchangeCore/fillReconciler.ts | 176 | COMPLETE |
| Balance Reconciler | exchangeCore/balanceReconciler.ts | 147 | COMPLETE |
| Position Tracker | exchangeCore/positionTracker.ts | 106 | COMPLETE |
| Time Sync | exchangeCore/timeSync.ts | 143 | COMPLETE |
| Trade Tracer | exchangeCore/tracer.ts | 68 | COMPLETE |
| Dry Run Executor | exchangeCore/dryRunExecutor.ts | 66 | COMPLETE |
| Core Service (Ana Motor) | exchangeCore/exchangeCoreService.ts | 1002 | COMPLETE |

### EXCHANGE ADAPTÖRLER

| Borsa | Adapter | Execution | Private WS | Durum |
|-------|---------|-----------|------------|-------|
| Binance | BinanceAdapter.ts | FAPI v1 REST | Evet | PRODUCTION |
| Gate.io | GateAdapter.ts | USDT Futures REST | Evet | PRODUCTION |
| Bybit | BybitAdapter.ts | Adapter hazir | Hayir | ADAPTER ONLY |
| OKX | OkxAdapter.ts | Adapter hazir | Hayir | ADAPTER ONLY |
| Coinbase | - | - | - | YOK |
| Kraken | - | - | - | YOK |
| KuCoin | - | - | - | YOK |
| Bitget | - | - | - | YOK |

### VERITABANI TABLOLARI (Migration 006-010)

| Tablo | Amac | TimescaleDB |
|-------|------|-------------|
| order_intents | Emir state machine | Hayir |
| exchange_fills | Dolmus emirler | Evet |
| exchange_connection_records | API key'ler (sifrelenmis) | Hayir |
| exchange_symbol_info | stepSize/tickSize cache | Hayir |
| user_risk_limits | Kullanici risk limitleri | Hayir |
| user_trade_policies | AI/Manual conflict policy | Hayir |
| position_snapshots | Pozisyon cache | Hayir |
| balance_snapshots | Bakiye snapshot'lari | Evet |
| trade_trace_events | Pipeline trace | Evet |
| reconciliation_log | Reconciliation kayitlari | Hayir |
| credential_access_log | API key erisim audit | Hayir |
| shadow_executions | Dry-run log | Hayir |
| audit_events | Genel audit log | Hayir |
| time_sync_log | Saat fark tespiti | Evet |

### REDIS KULLANIMI

| Key Pattern | Amac | TTL |
|-------------|------|-----|
| rl:exchange:{VENUE} | Borsa rate limit | 60s |
| rl:user:{userId}:{VENUE} | Kullanici rate limit | 60s |
| rl:symbol:{symbol}:{VENUE} | Symbol rate limit | 60s |
| rl:global | Global rate limit | 60s |
| cb:{VENUE}:state | Circuit breaker durumu | - |
| killswitch:{level}:{target} | Kill switch | - |
| policy:manual_trade:{userId}:{symbol} | AI cooldown | 5dk |
| pos:{userId}:{account}:{symbol} | Pozisyon cache | 10dk |

---

## 2. EXECUTION PIPELINE (Mevcut Akis)

```
Kullanici "BUY" tiklar
    |
    v
POST /api/trade/place
    |
    v
ExchangeCoreService.submitManualIntent()
    |
    v
IntentFactory -> CoreIntentRecord (state: ACCEPTED)
    |
    v
DB INSERT: order_intents
    |
    v
interactiveQueue.push(intentId)  [in-memory]
    |
    v
Tick Loop (250ms):
    |
    +-- 1. KillSwitch.isBlocked()      -> Redis killswitch:*
    +-- 2. CircuitBreaker.canRequest()  -> Redis cb:BINANCE:state
    +-- 3. RiskGate.check()             -> Redis counters + DB limits
    +-- 4. PolicyEngine.evaluate()      -> Redis policy:* + DB policies
    +-- 5. OrderNormalizer.normalize()   -> DB exchange_symbol_info
    +-- 6. RateLimiter.tryAcquireAll()  -> Redis rl:*
    +-- 7. ApiVault.getCredentials()    -> DB decrypt + audit log
    +-- 8. State -> SENT
    +-- 9. executeBinanceOrder()        -> HMAC-SHA256 signed REST
    +-- 10. State -> DONE (fill data)
    |
    v
PrivateStreamManager (WebSocket):
    -> ORDER_TRADE_UPDATE -> FillReconciler -> exchange_fills
    -> ACCOUNT_UPDATE -> PositionTracker -> position_snapshots
    -> ACCOUNT_UPDATE -> BalanceReconciler -> balance_snapshots

OrderReconciler (30s tick):
    -> Stale SENT orders (>60s) -> exchange query -> state fix
```

---

## 3. EKSIK OLAN / BAGLANTI KOPUK NOKTALAR

### KRITIK EKSIKLER

| # | Sorun | Etki | Oncelik |
|---|-------|------|---------|
| 1 | **WebSocket Push yok** | Frontend polling yapmak zorunda, canli guncelleme yok | P0 |
| 2 | **Cancel order TODO** | Kullanici emir iptal edemiyor | P0 |
| 3 | **Bybit/OKX execution yok** | Adapter var ama ExchangeCore'da execute edilmiyor | P1 |
| 4 | **OrderEntryPanel hardcoded balance** | `available = 403.67` sabit, gercek bakiye cekilmiyor | P1 |
| 5 | **Account snapshot terminal'de yok** | `/api/exchanges/:id/account` endpoint var ama terminal kullanmiyor | P1 |
| 6 | **Frontend state polling** | `/api/exchange-core/intents` ve `/events` poll ediliyor, WS yok | P1 |

### BAGLANTI KOPUK ENDPOINTLER

| Endpoint | Backend | Frontend |
|----------|---------|----------|
| GET /api/exchanges/:id/symbols | Calisiyor | Kullanilmiyor |
| GET /api/exchanges/:id/status | Calisiyor | Kullanilmiyor |
| GET /api/exchanges/:id/account | Calisiyor | Sadece Settings, Terminal'de yok |
| POST /kill-switch/activate | Calisiyor | UI yok |
| POST /kill-switch/deactivate | Calisiyor | UI yok |
| GET /kill-switch/status | Calisiyor | UI yok |
| GET /trace/:intentId | Calisiyor | UI yok |
| POST /trade/cancel | Placeholder | UI var ama backend TODO |

---

## 4. 1000 KULLANICI ICIN MIMARI PLAN

### 4.1 WebSocket Gateway (EN KRITIK EKSIK)

Mevcut sorun: Frontend her 2-3 saniyede REST poll yapiyor. 1000 kullanici = saniyede 500 request.

**Cozum: SSE veya WebSocket Gateway**

```
Kullanici Tarayicisi
    |
    v
WebSocket /ws/exchange?token=xxx
    |
    v
WsGateway (yeni modul)
    |
    +-- userId -> subscribe edilecek event'ler
    |
    v
ExchangeCoreService.on('event', (event) => {
    wsGateway.pushToUser(event.scope.userId, event)
})
    |
    v
PrivateStreamManager.on('fill/position/balance', (userId, data) => {
    wsGateway.pushToUser(userId, data)
})
```

**Yapilacaklar:**
1. `server/src/services/wsGateway.ts` - WebSocket server (ws veya Socket.io)
2. ExchangeCoreService'e event emitter ekle
3. PrivateStreamManager callback'lerini WsGateway'e bagla
4. Frontend: REST poll yerine WS subscription

**Kapasite hesabi:**
- 1000 kullanici x 1 WS baglantisi = 1000 concurrent connection
- Her connection ~50KB RAM = ~50MB toplam
- Event rate: ~10 event/saniye/kullanici = 10K event/saniye
- Tek Node.js instance bunu kaldirabilir (100K concurrent WS destekler)

### 4.2 Cancel Order Implementasyonu

Mevcut: `/api/trade/cancel` placeholder

**Yapilacaklar:**
1. ExchangeCoreService'e `cancelIntent(intentId, userId)` metodu ekle
2. Intent state kontrolu: sadece ACCEPTED, QUEUED, SENT iptal edilebilir
3. ACCEPTED/QUEUED: direkt state -> CANCELED (exchange'e gitmemis)
4. SENT: exchange cancel API cagir -> state -> CANCELED
5. Binance: DELETE /fapi/v1/order
6. Gate.io: DELETE /api/v4/futures/usdt/orders/{orderId}
7. Frontend: cancel butonu + confirmation

### 4.3 Bybit/OKX Execution Entegrasyonu

Mevcut: Adapter var, ExchangeCore sadece BINANCE ve GATEIO execute ediyor

**Yapilacaklar:**
1. ExchangeCoreService.processIntent() icinde `executeBybitOrder()` ve `executeOkxOrder()` fonksiyonlari ekle
2. PrivateStreamManager'a Bybit ve OKX WebSocket parser'lari ekle
3. CircuitBreaker'da BYBIT ve OKX zaten tanimli
4. SymbolRegistry'ye Bybit/OKX symbol fetch ekle

### 4.4 Terminal'e Canli Account Data

Mevcut: OrderEntryPanel'de `available = 403.67` hardcoded

**Yapilacaklar:**
1. useExchangeConfigs hook'una `fetchAccountSnapshot(exchangeId)` ekle
2. ExchangeTerminalPage mount'ta account snapshot cek
3. PrivateStreamManager balance event -> WsGateway -> frontend state guncelle
4. Open orders, positions de ayni akisla gelsin

---

## 5. OLCEKLENDIRME STRATEJISI

### 5.1 Mevcut Tek Sunucu Limitleri

| Kaynak | Mevcut | 1000 Kullanici |
|--------|--------|----------------|
| API-1 RAM | 2GB | Yeterli (Redis ayri) |
| Redis bellek | ~500MB | ~1GB (rate limit + position cache) |
| PostgreSQL | Tek instance | Yeterli (TimescaleDB compress) |
| Private WS | ~50 concurrent | 1000 concurrent gerekli |

### 5.2 Darbogazlar

**1. Private WebSocket Yonetimi**
- Her kullanici icin borsa basina 1 WS = 1000 kullanici x 2 borsa = 2000 WS
- Node.js tek instance 10K WS kaldirabilir -> SORUN YOK
- Ama her WS icin listenKey refresh (30dk) = 2000/30 = ~1 request/saniye
- Binance rate limit: 1200/dk -> SORUN YOK

**2. Order Execution Throughput**
- Mevcut: 250ms tick, max 128 concurrent
- 1000 kullanici ayni anda emir verse: queue birikir
- Cozum: tick interval 150ms'e dusur, max concurrent 256'ya cikar
- Veya: execution worker'i ayri process'e cikar

**3. Rate Limiting**
- Binance: 1200 request/dk (tum kullanicilar icin paylasilir)
- 1000 kullanici x ortalama 2 emir/dk = 2000 emir/dk
- Rate limiter bunu zaten engelliyor (queue'de bekler)
- Cozum: Binance sub-account kullanimi veya Binance Broker API

### 5.3 Olceklendirme Adimlari

**Faz A (Simdi - 100 kullanici):**
- Tek API sunucu yeterli
- WsGateway ekle
- Cancel order ekle
- Terminal'e canli data bagla

**Faz B (100-500 kullanici):**
- API-2 sunucuyu Nginx load balancer arkasina al
- WsGateway sticky session ile dagit
- Redis cluster mode (sentinel)
- PostgreSQL read replica (read-heavy sorgular icin)

**Faz C (500-1000+ kullanici):**
- ExchangeCore worker'i ayri process'e cikar
- PrivateStreamManager ayri service olarak calistir
- Bull/BullMQ queue sistemi ekle (in-memory queue yerine)
- Connection pool buyut

---

## 6. GUVENLIK DEGERLENDIRMESI

### Mevcut Guvenlik (Iyi)
- AES-256-GCM ile API key sifreleme
- Credential access audit log
- Rate limiting (4 seviye)
- Kill switch (5 seviye)
- Circuit breaker (borsa bazli)

### Eksik Guvenlik
| Sorun | Risk | Oneri |
|-------|------|-------|
| Encryption key .env'de duz | Yuksek | KMS/HSM kullan |
| Tenant isolation sadece x-user-id header | Yuksek | JWT token + middleware |
| IP whitelist sadece frontend gosterim | Orta | Backend'de de dogrula |
| WebSocket auth yok (henuz) | Yuksek | Token-based WS auth ekle |
| Cancel order auth kontrolu yok | Yuksek | userId + intentId cross-check |

---

## 7. ONCELIK SIRASI (Roadmap)

### HAFTA 1: Temel Eksikler
1. Cancel order implementasyonu (ExchangeCore + route + UI)
2. WsGateway modulu (temel event push)
3. Terminal'e canli balance/positions baglama

### HAFTA 2: Canli Data Akisi
4. WsGateway <- PrivateStreamManager entegrasyonu
5. WsGateway <- ExchangeCoreService event entegrasyonu
6. Frontend: WS subscription (open orders, positions, balances)
7. Open orders listesi (canli, cancel butonlu)

### HAFTA 3: Coklu Borsa
8. Bybit execution + private WS
9. OKX execution + private WS
10. ExchangeCore multi-venue dispatch

### HAFTA 4: UI Tamamlama
11. Kill Switch yonetim paneli (admin)
12. Trade trace viewer (debug)
13. Account snapshot detay sayfasi

### HAFTA 5: Olceklendirme
14. Nginx load balancer (API-1 + API-2)
15. WS sticky session
16. Performance test (1000 concurrent)

---

## 8. DOSYA HARITASI

```
server/src/
├── exchangeManager/           # Borsa baglama katmani
│   ├── ExchangeManager.ts     # 536 satir - Ana koordinator
│   ├── types.ts               # 185 satir - Tip tanimlamalari
│   ├── capabilities.ts        # 50 satir - Borsa ozellik matrisi
│   ├── errors.ts              # 22 satir - Yapilandirilmis hatalar
│   ├── adapters/
│   │   ├── BaseAdapter.ts     # 69 satir - Adapter interface
│   │   ├── BinanceAdapter.ts  # 100 satir
│   │   ├── BybitAdapter.ts    # 81 satir
│   │   ├── GateAdapter.ts     # 79 satir
│   │   ├── OkxAdapter.ts      # 83 satir
│   │   └── MockAdapter.ts     # 49 satir
│   └── normalization/
│       ├── symbols.ts
│       └── terminologyTranslator.ts
│
├── services/exchangeCore/     # Emir yurutme motoru (Faz 5-12)
│   ├── exchangeCoreService.ts # 1002 satir - ANA MOTOR
│   ├── types.ts               # 129 satir
│   ├── intentFactory.ts       # 75 satir
│   ├── intentDedup.ts         # Idempotency
│   ├── killSwitch.ts          # 149 satir - Acil durdurma
│   ├── riskGate.ts            # 181 satir - Risk kontrolu
│   ├── policyEngine.ts        # 220 satir - AI/Manual cakisma
│   ├── symbolRegistry.ts      # 214 satir - Symbol metadata
│   ├── orderNormalizer.ts     # 189 satir - Emir normalizasyon
│   ├── exchangeRateLimiter.ts # 147 satir - Rate limiting
│   ├── circuitBreaker.ts      # 178 satir - Hata izolasyonu
│   ├── apiVault.ts            # 320 satir - Credential guvenlik
│   ├── privateStreamManager.ts# 326 satir - WS user data
│   ├── privateStreamBinance.ts# 118 satir
│   ├── privateStreamGate.ts   # 103 satir
│   ├── reconciler.ts          # 299 satir - Emir reconciliation
│   ├── fillReconciler.ts      # 176 satir
│   ├── balanceReconciler.ts   # 147 satir
│   ├── positionTracker.ts     # 106 satir
│   ├── timeSync.ts            # 143 satir
│   ├── tracer.ts              # 68 satir
│   └── dryRunExecutor.ts      # 66 satir
│
├── routes/
│   ├── exchanges.ts           # /api/exchanges/* (baglama)
│   ├── trade.ts               # /api/trade/* (emir verme)
│   └── exchangeCore.ts        # /api/exchange-core/* (state/events)
│
├── services/
│   ├── connectionService.ts   # DB CRUD for connections
│   └── wsGateway.ts           # [EKSIK] WebSocket push
│
└── migrations/
    ├── 006-trade-engine.sql
    ├── 007-reconciliation.sql
    ├── 008-credential-vault.sql
    ├── 009-policy-engine.sql
    └── 010-post-trade.sql
```

---

## 9. SONUC

Bitrium backend'i **production-grade bir OMS/EMS (Order/Execution Management System)** olarak tamamlanmis durumda. 12 faz boyunca insa edilen pipeline, risk kontrollerinden execution'a, reconciliation'dan audit'e kadar tum katmanlari kapsiyor.

**1000 kullanici icin en kritik 3 eksik:**

1. **WebSocket Gateway** - Frontend'e canli event push (polling yerine)
2. **Cancel Order** - Kullanicinin emir iptal edebilmesi
3. **Terminal Data Binding** - Gercek balance/positions/orders gosterimi

Bu 3 eksik kapatildiginda sistem 1000 kullaniciyi destekleyecek kapasitede. Altyapi (Redis rate limiting, circuit breaker, reconciliation) zaten mevcut ve olceklenebilir.

**Tam bir exchange engine'e gerek yok.** Mevcut "Multi-Exchange Connected Trading Platform" mimarisi dogru secim. Matching engine yok cunku emirler kullanici adina dis borsalara iletiliyor.
