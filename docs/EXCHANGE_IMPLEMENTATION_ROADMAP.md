# Bitrium Exchange — Implementation Roadmap
**Tarih:** 2026-03-18
**Oncelik Mantigi:** Islem guvenligi > Hesap dogrulugu > Olceklenebilir canli yayin

---

## ONCELIK SIRASI VE GEREKCE

| Sira | Modul | Neden Bu Sirada |
|------|-------|-----------------|
| 1 | **Cancel Order** | "Emir aciliyor ama iptal edilemiyor" = en kritik operasyonel acik. Risk, hukuk, kullanici guveni. |
| 2 | **Terminal Canli Data** | Hardcoded balance ile gercek sistem test edilemez. RiskGate dogrulugu gorunmez. |
| 3 | **WebSocket Gateway** | 1000 kullaniciya olceklenmeden once sart. Ama once islem dongusu kapanmali. |

**Temel kural:** Place -> Update -> Cancel/Fill dongusu tamamlanmadan sistem "production" sayilamaz.

---

## FAZ 1: CANCEL ORDER

### 1.1 Neden Ilk Bu

- Trading urununde cancel olmadan prod'a cikmak en tehlikeli operasyonel acik
- Yanlis emir, stale order, market kaymasi, duplicate order gibi durumlarda kullanici cikis yapamaz
- Hukuki ve support yuku acisindan en problemli alan
- Risk tarafinda en tehlikeli eksik — kullanici stuck kalir

### 1.2 Mevcut Durum

```
server/src/routes/trade.ts:
  POST /api/trade/cancel — PLACEHOLDER (TODO yorumlu)

server/src/services/exchangeCore/exchangeCoreService.ts:
  cancelIntent() — YOK, eklenmesi gerekiyor

Binance API:
  DELETE /fapi/v1/order — HAZIR (adapter'da yok ama API mevcut)

Gate.io API:
  DELETE /api/v4/futures/usdt/orders/{orderId} — HAZIR

Redis:
  Idempotency key sistemi mevcut (intentDedup.ts)
```

### 1.3 Yapilacaklar (Detayli TODO)

#### Backend

- [ ] **1.3.1** `ExchangeCoreService.cancelIntent(intentId, userId)` metodu ekle
  - Dosya: `server/src/services/exchangeCore/exchangeCoreService.ts`
  - Intent state kontrolu:
    - `ACCEPTED` veya `QUEUED` → direkt `CANCELED` (exchange'e gitmemis, queue'den cikar)
    - `SENT` → exchange cancel API cagir → basarili ise `CANCELED`
    - `DONE`, `CANCELED`, `REJECTED`, `ERROR` → reject (zaten kapanmis)
    - `PENDING` → reject (henuz kabul edilmemis)
  - userId cross-check (baskasinin emrini iptal edemez)
  - Event emit: `order.cancel_requested`, `order.canceled`
  - TradeTracer'a cancel stage ekle

- [ ] **1.3.2** Exchange Cancel Implementation — Binance
  - Dosya: `server/src/services/exchangeCore/exchangeCoreService.ts` (veya ayri dosya)
  - `cancelBinanceOrder(intent, credentials)`:
    - DELETE `/fapi/v1/order`
    - Params: `symbol`, `origClientOrderId` (clientOrderId kullan)
    - HMAC-SHA256 imza (executeBinanceOrder ile ayni pattern)
    - Response: `{ orderId, status, origClientOrderId }`
    - Status mapping: `CANCELED` → intent state `CANCELED`
    - Partial fill durumu: `executedQty > 0` ise state `DONE` (kismi dolu, cancel edildi)

- [ ] **1.3.3** Exchange Cancel Implementation — Gate.io
  - `cancelGateOrder(intent, credentials)`:
    - DELETE `/api/v4/futures/usdt/orders/{exchange_order_id}`
    - HMAC-SHA512 imza (executeGateOrder ile ayni pattern)
    - Response mapping ayni mantik

- [ ] **1.3.4** Cancel Reconciliation
  - `OrderReconciler` (reconciler.ts) zaten stale SENT order'lari kontrol ediyor
  - Cancel sonrasi reconciliation:
    - Cancel request gonderildi ama response timeout → reconciler yakalar
    - Exchange "order not found" donerse → state `CANCELED` (zaten kapanmis)
    - Exchange "already filled" donerse → state `DONE` (fill data guncelle)
  - `reconciliation_log`'a cancel event'leri de yaz

- [ ] **1.3.5** Cancel Idempotency
  - Ayni intent icin birden fazla cancel request gelirse:
    - Ilk cancel basarili → sonraki cancel'lar `{ ok: true, alreadyCanceled: true }`
    - Redis'te `cancel_requested:{intentId}` flag'i set et (60s TTL)
    - Duplicate cancel'i sessizce kabul et, tekrar exchange'e gitme

- [ ] **1.3.6** Cancel Rate Limiting
  - ExchangeRateLimiter'a cancel weight ekle (cancel = 1 weight)
  - Ayni rate limit havuzundan dusuluyor (venue/user/global)

- [ ] **1.3.7** API Route — Cancel Endpoint
  - Dosya: `server/src/routes/trade.ts`
  - `POST /api/trade/cancel`
  - Body: `{ intentId: string }` veya `{ clientOrderId: string }`
  - Auth: `x-user-id` header (sonra JWT'ye gecilecek)
  - Validation:
    - intentId veya clientOrderId zorunlu
    - userId cross-check
    - Intent mevcut mu kontrol
  - Response: `{ ok, intent: CoreIntentRecord, message? }`
  - Audit log: `TRADE_CANCEL` event

- [ ] **1.3.8** Cancel All — Toplu Iptal
  - `POST /api/trade/cancel-all`
  - Body: `{ exchangeAccountId?, venue?, symbol? }` (filter)
  - Tum ACCEPTED + QUEUED + SENT intent'leri iptal et
  - Her biri icin ayri cancel akisi
  - Kill Switch ile entegre: kill switch aktif iken cancel-all otomatik cagrilabilir

#### Frontend

- [ ] **1.3.9** Open Orders listesine Cancel butonu ekle
  - Dosya: `src/components/exchange/` (yeni veya mevcut component)
  - Her open order satirinda "Cancel" butonu
  - Click -> confirmation dialog -> POST /api/trade/cancel
  - Optimistic UI: tiklaninca "Canceling..." goster
  - Response gelince state guncelle

- [ ] **1.3.10** Cancel All butonu
  - Exchange Terminal header'da veya order panel'de
  - "Cancel All Open Orders" butonu
  - Confirmation: "Are you sure? X open orders will be canceled."

### 1.4 State Machine (Cancel Akisi)

```
ACCEPTED ──cancel──> CANCELED (queue'den cikar, exchange'e gitmedi)
QUEUED   ──cancel──> CANCELED (queue'den cikar, exchange'e gitmedi)
SENT     ──cancel──> CANCEL_REQUESTED ──exchange ack──> CANCELED
                                       ──partial fill──> DONE (kismi dolu)
                                       ──timeout──> reconciler yakalar
DONE     ──cancel──> REJECT (zaten kapanmis)
CANCELED ──cancel──> NOOP (zaten iptal)
ERROR    ──cancel──> NOOP (zaten hata)
```

### 1.5 Dosya Degisiklikleri

| Dosya | Degisiklik |
|-------|------------|
| `exchangeCoreService.ts` | `cancelIntent()`, `cancelBinanceOrder()`, `cancelGateOrder()` ekle |
| `types.ts` | `CANCEL_REQUESTED` state ekle (optional) |
| `routes/trade.ts` | `/cancel` ve `/cancel-all` endpoint'lerini implement et |
| `reconciler.ts` | Cancel sonrasi reconciliation logic |
| `intentDedup.ts` | Cancel idempotency |
| `tracer.ts` | Cancel stage trace event |

---

## FAZ 2: TERMINAL CANLI DATA

### 2.1 Neden Ikinci Bu

- Hardcoded `available = 403.67` ile kullanici gercek sistemi test edemez
- Emir oncesi kullanilabilir bakiye, margin, position, open order exposure dogru gorunmezse tum UX sahte olur
- RiskGate'in dogrulugu da pratikte gorunmez hale gelir
- Kullanici "platform gercekten benim hesabimla senkron calisiyor" hissini burada alir

### 2.2 Mevcut Durum

```
Backend (HAZIR):
  GET /api/exchanges/:id/account — ExchangeManager.getAccountSnapshot()
    -> Binance: /fapi/v2/account (balances, positions)
    -> Gate.io: /api/v4/futures/usdt/accounts
  PrivateStreamManager — WS user data (fills, positions, balances)
  PositionTracker — Redis + DB position cache
  BalanceReconciler — balance_snapshots table

Frontend (EKSIK):
  OrderEntryPanel.tsx: available = 403.67 (HARDCODED)
  ExchangeTerminalPage: open orders listesi YOK
  ExchangeTerminalPage: positions listesi STUB
  ExchangeTerminalPage: balance gercek degil
```

### 2.3 Yapilacaklar (Detayli TODO)

#### Backend API Genisletme

- [ ] **2.3.1** Account Snapshot Endpoint'i Zenginlestir
  - Dosya: `server/src/routes/exchanges.ts`
  - `GET /api/exchanges/:exchangeId/account` zaten var ama response'u normalize et:
  ```typescript
  {
    balances: { asset: string, available: number, total: number }[],
    positions: { symbol: string, side: "LONG"|"SHORT", size: number,
                 entryPrice: number, markPrice: number, unrealizedPnl: number,
                 leverage: number, liquidationPrice: number }[],
    openOrders: { intentId: string, symbol: string, side: string,
                  type: string, qty: number, price: number,
                  filledQty: number, status: string, createdAt: string }[],
    marginInfo: { totalMargin: number, usedMargin: number,
                  availableMargin: number, marginRatio: number }
  }
  ```

- [ ] **2.3.2** Open Orders Endpoint
  - `GET /api/exchanges/:exchangeId/orders/open`
  - DB'den: `SELECT * FROM order_intents WHERE exchange_account_id = $1 AND state IN ('ACCEPTED','QUEUED','SENT')`
  - + Exchange'den: live open orders query (reconciliation amacli)
  - Merge edip don

- [ ] **2.3.3** Positions Endpoint
  - `GET /api/exchanges/:exchangeId/positions`
  - PositionTracker.getAllPositions(userId) + exchange live query
  - Redis cache varsa onu don (10dk TTL), yoksa exchange'den cek

- [ ] **2.3.4** Trade History Endpoint
  - `GET /api/exchanges/:exchangeId/fills?limit=50`
  - DB'den: `SELECT * FROM exchange_fills WHERE exchange_account_id = $1 ORDER BY filled_at DESC LIMIT $2`

#### Frontend Terminal Entegrasyonu

- [ ] **2.3.5** `useAccountData` Hook
  - Dosya: `src/hooks/useAccountData.ts` (yeni)
  - Mount'ta `/api/exchanges/:id/account` cek
  - State: `{ balances, positions, openOrders, marginInfo, loading, error }`
  - Auto-refresh: her 10 saniyede (sonra WS ile degistirilecek)
  - Exchange degisince yeniden fetch

- [ ] **2.3.6** OrderEntryPanel — Gercek Balance
  - Dosya: `src/components/exchange/OrderEntryPanel.tsx`
  - `available = 403.67` -> `useAccountData().balances.find(b => b.asset === 'USDT')?.available`
  - Margin info'yu da goster: "Margin Ratio: X%", "Available Margin: X USDT"
  - Position exposure goster (mevcut pozisyonlar + acik emirler)

- [ ] **2.3.7** Open Orders Tab
  - Dosya: `src/components/exchange/OpenOrdersPanel.tsx` (yeni veya mevcut)
  - ExchangeTerminalPage alt tab'da "Open Orders(N)" goster
  - Her satirda: Symbol, Side, Type, Qty, Price, Filled, Status, Cancel butonu
  - Cancel butonu -> POST /api/trade/cancel (Faz 1'den)
  - Cancel All butonu header'da

- [ ] **2.3.8** Positions Tab
  - Dosya: `src/components/exchange/PositionsPanel.tsx` (yeni veya mevcut)
  - ExchangeTerminalPage alt tab'da "Positions(N)" goster
  - Her satirda: Symbol, Side, Size, Entry Price, Mark Price, Unrealized PnL, Leverage, Liq Price
  - PnL yesil/kirmizi renk
  - Close Position butonu (market close = reverse order)

- [ ] **2.3.9** FuturesAccountPanel — Gercek Data
  - Dosya: `src/components/exchange/FuturesAccountPanel.tsx`
  - Mevcut component var ama mock data kullaniyor
  - useAccountData() hook'undan gercek balance/margin cek

- [ ] **2.3.10** Trade History Tab
  - ExchangeTerminalPage alt tab: "Trade History(N)"
  - Son 50 fill goster
  - Her satirda: Symbol, Side, Price, Qty, Fee, PnL, Time

### 2.4 Data Akisi

```
Mount:
  ExchangeTerminalPage -> useAccountData(selectedExchangeId)
    -> GET /api/exchanges/:id/account
    -> state: { balances, positions, openOrders, marginInfo }

Her 10s:
  useAccountData auto-refresh
    -> balances, positions, openOrders guncellenir

Emir verince:
  POST /api/trade/place -> basarili
    -> useAccountData.refetch() (immediate)
    -> openOrders listesi guncellenir

Emir iptal edince:
  POST /api/trade/cancel -> basarili
    -> useAccountData.refetch() (immediate)
    -> openOrders listesi guncellenir

[FAZ 3'te WS ile degistirilecek - polling kaldirilacak]
```

### 2.5 Dosya Degisiklikleri

| Dosya | Degisiklik |
|-------|------------|
| `routes/exchanges.ts` | Account response normalize, orders/positions endpoint |
| `hooks/useAccountData.ts` | Yeni hook (balance, positions, orders) |
| `OrderEntryPanel.tsx` | Hardcoded balance -> gercek balance |
| `FuturesAccountPanel.tsx` | Mock data -> gercek data |
| `OpenOrdersPanel.tsx` | Yeni component (open orders + cancel) |
| `PositionsPanel.tsx` | Yeni veya guncelle (gercek positions) |
| `ExchangeTerminalPage.tsx` | Tab'lari bagla |

---

## FAZ 3: WEBSOCKET GATEWAY

### 3.1 Neden Ucuncu Bu

- Islem dongusu (place + cancel + real state) tamamlandiktan sonra gelir
- Olcek ve canlilik katmani — cekirdek trading dogrulugundan sonra
- Ama geciktirilmemeli: Faz 1+2 biter bitmez baslanmali
- 1000 kullanici x 10s polling = saniyede 100 request, WS ile 0

### 3.2 Mevcut Durum

```
Backend:
  ExchangeCoreService.events — In-memory ring buffer (5000 event)
  PrivateStreamManager — Exchange WS zaten calisiyor
  Redis — Pub/sub mevcut (redis.ts)

Frontend:
  Polling: /api/exchange-core/intents, /events (10s interval)
  Gercek WS baglantisi: YOK
```

### 3.3 Yapilacaklar (Detayli TODO)

#### Backend — WsGateway

- [ ] **3.3.1** WebSocket Server Kurulumu
  - Dosya: `server/src/services/wsGateway.ts` (yeni)
  - `ws` veya `Socket.io` paketi (ws daha hafif, Socket.io daha kolay)
  - HTTP server'a upgrade: `server.on('upgrade', wsGateway.handleUpgrade)`
  - Path: `/ws/exchange`
  - Auth: URL'de token param veya ilk mesajda auth
  - Connection tracking: `Map<userId, Set<WebSocket>>`

- [ ] **3.3.2** Auth & Session
  - WS baglantisinda JWT token dogrula
  - Token gecersiz veya expired -> WS close(4001, "Unauthorized")
  - Her userId icin birden fazla connection destekle (birden fazla tab)
  - Heartbeat: 30s ping/pong, stale connection temizligi

- [ ] **3.3.3** Channel Subscription
  - Kullanici WS acinca otomatik subscribe:
    - `orders:{userId}` — emir guncellemeleri
    - `positions:{userId}` — pozisyon degisiklikleri
    - `balances:{userId}` — bakiye degisiklikleri
    - `fills:{userId}` — fill event'leri
    - `system:{userId}` — kill switch, circuit breaker, hata bildirimleri
  - Opsiyonel subscribe: `orderbook:{symbol}`, `trades:{symbol}` (public data)

- [ ] **3.3.4** ExchangeCoreService -> WsGateway Entegrasyonu
  - ExchangeCoreService'e EventEmitter pattern ekle
  - `emitEvent()` icinde: `wsGateway.pushToUser(userId, event)`
  - Event tipleri:
    - `order.accepted` -> orders channel
    - `order.sent` -> orders channel
    - `order.canceled` -> orders channel
    - `order.update` (fill) -> orders + fills channel
    - `risk.rejected` -> orders channel
    - `error` -> system channel

- [ ] **3.3.5** PrivateStreamManager -> WsGateway Entegrasyonu
  - PrivateStreamManager callback'lerinde:
    - `onEvent(userId, accountId, venue, events)`:
      - ORDER_TRADE_UPDATE -> orders channel
      - ACCOUNT_UPDATE (balance) -> balances channel
      - ACCOUNT_UPDATE (position) -> positions channel
    - `onDisconnect` -> system channel (exchange WS koptu)
    - `onReconnect` -> system channel (exchange WS yeniden baglandi)

- [ ] **3.3.6** Redis Pub/Sub (Multi-Instance)
  - Eger API-1 + API-2 load balance yapilacaksa:
  - Event'leri Redis Pub/Sub ile yay
  - Publisher: ExchangeCoreService, PrivateStreamManager
  - Subscriber: Her API instance'daki WsGateway
  - Channel: `ws:user:{userId}`
  - Bu sayede hangi instance'ta olursa olsun kullanici event alir

- [ ] **3.3.7** Reconnection & Snapshot
  - WS kopup yeniden baglaninca:
    - Client `lastEventId` gonderir
    - Server missed event'leri ring buffer'dan bulur
    - Bulamazsa full snapshot gonderir (account data)
  - Initial connection'da da full snapshot gonder

#### Frontend — WS Client

- [ ] **3.3.8** `useExchangeWebSocket` Hook
  - Dosya: `src/hooks/useExchangeWebSocket.ts` (yeni)
  - WS baglantisi ac: `ws://host/ws/exchange?token=xxx`
  - Reconnect: exponential backoff (1s, 2s, 4s, max 30s)
  - Message handler:
    - `order.*` -> useAccountData state guncelle
    - `position.*` -> positions state guncelle
    - `balance.*` -> balances state guncelle
    - `fill.*` -> fills listesine ekle
    - `system.*` -> toast notification
  - Connection status: "Connected" / "Reconnecting..." / "Disconnected"

- [ ] **3.3.9** Polling -> WS Gecisi
  - useAccountData'daki 10s polling'i kaldir
  - Initial snapshot: mount'ta 1 kere REST cek
  - Sonrasi: WS event'leri ile incremental guncelle
  - Fallback: WS 30s+ kopuk kalirsa REST polling'e gec

- [ ] **3.3.10** Connection Status Indicator
  - ExchangeTopBar'da WS durumu goster
  - Yesil dot: Connected
  - Sari dot: Reconnecting
  - Kirmizi dot: Disconnected
  - Mevcut `ExchangeTopBar.tsx`'de zaten connection status var, WS state'i bagla

### 3.4 WS Mesaj Formati

```typescript
// Server -> Client
{
  channel: "orders" | "positions" | "balances" | "fills" | "system",
  type: "order.accepted" | "order.canceled" | "position.update" | "balance.update" | ...,
  eventId: "uuid",
  ts: "ISO string",
  data: { ... event-specific payload ... }
}

// Client -> Server
{
  action: "subscribe" | "unsubscribe" | "ping",
  channel?: string,
  lastEventId?: string  // reconnect sonrasi missed event'ler icin
}
```

### 3.5 Kapasite Hesabi

| Metrik | Deger | Not |
|--------|-------|-----|
| Concurrent WS | 1000 | Tek Node.js instance yeterli |
| RAM per connection | ~50KB | Toplam ~50MB |
| Event rate | ~10/s/user | 10K event/s toplam |
| Bandwidth | ~1KB/event | ~10MB/s toplam |
| Redis pub/sub | ~10K msg/s | Rahat kaldirir |

### 3.6 Dosya Degisiklikleri

| Dosya | Degisiklik |
|-------|------------|
| `server/src/services/wsGateway.ts` | Yeni dosya — WS server |
| `server/src/server.ts` veya `index.ts` | HTTP upgrade handler |
| `exchangeCoreService.ts` | Event emitter -> wsGateway push |
| `privateStreamManager.ts` | Callback -> wsGateway push |
| `src/hooks/useExchangeWebSocket.ts` | Yeni hook — WS client |
| `src/hooks/useAccountData.ts` | Polling -> WS gecisi |
| `ExchangeTopBar.tsx` | WS connection status |

---

## FAZ 4: BYBIT + OKX EXECUTION (Sonraki Adim)

### 4.1 Mevcut Durum
- Adapter'lar hazir (BybitAdapter.ts, OkxAdapter.ts)
- ExchangeCore sadece BINANCE ve GATEIO execute ediyor
- CircuitBreaker'da BYBIT ve OKX tanimli

### 4.2 TODO

- [ ] **4.2.1** `executeBybitOrder()` fonksiyonu
  - Bybit V5 API: POST `/v5/order/create`
  - HMAC-SHA256 imza
  - Symbol mapping: BTC/USDT -> BTCUSDT

- [ ] **4.2.2** `executeOkxOrder()` fonksiyonu
  - OKX V5 API: POST `/api/v5/trade/order`
  - HMAC-SHA256 + passphrase
  - Symbol mapping: BTC/USDT -> BTC-USDT-SWAP

- [ ] **4.2.3** Cancel Implementation (Bybit + OKX)
  - Bybit: POST `/v5/order/cancel`
  - OKX: POST `/api/v5/trade/cancel-order`

- [ ] **4.2.4** Private Stream (Bybit + OKX)
  - Bybit: WSS `/v5/private`
  - OKX: WSS `/ws/v5/private`
  - Parser'lar: `privateStreamBybit.ts`, `privateStreamOkx.ts`

- [ ] **4.2.5** Symbol Registry guncelle
  - Bybit: GET `/v5/market/instruments-info`
  - OKX: GET `/api/v5/public/instruments`

---

## FAZ 5: GUVENLIK & OLCEKLENDIRME (Production Hardening)

### 5.1 TODO

- [ ] **5.1.1** JWT Auth (x-user-id header'dan gecis)
- [ ] **5.1.2** Encryption key -> KMS/HSM
- [ ] **5.1.3** WebSocket token auth
- [ ] **5.1.4** Nginx load balancer (API-1 + API-2)
- [ ] **5.1.5** WS sticky session (ip_hash veya cookie)
- [ ] **5.1.6** Redis Sentinel (HA)
- [ ] **5.1.7** PostgreSQL read replica
- [ ] **5.1.8** Rate limit dashboard (admin)
- [ ] **5.1.9** Circuit breaker dashboard (admin)
- [ ] **5.1.10** Kill switch admin UI

---

## FAZ 6: ADMIN & OBSERVABILITY UI

### 6.1 TODO

- [ ] **6.1.1** Kill Switch Management Panel
  - Activate/Deactivate (5 level)
  - Active states listesi
  - API: `/api/exchange-core/kill-switch/*` zaten var

- [ ] **6.1.2** Trade Trace Viewer
  - Intent ID ile pipeline trace goster
  - Her stage: RISK -> POLICY -> NORMALIZE -> EXECUTE
  - Timing bilgisi (duration_ms)
  - API: `/api/exchange-core/trace/:intentId` zaten var

- [ ] **6.1.3** Circuit Breaker Dashboard
  - Her borsa: CLOSED/OPEN/HALF_OPEN durumu
  - Failure count, last failure, cooldown timer
  - Manuel reset butonu

- [ ] **6.1.4** Rate Limit Monitor
  - Global/Venue/User/Symbol kullanim orani
  - Remaining capacity
  - Throttled request sayisi

---

## ZAMAN CIZELGESI

```
HAFTA 1: Cancel Order (Faz 1)
  Gun 1-2: cancelIntent() + Binance cancel + Gate cancel
  Gun 3:   Cancel reconciliation + idempotency
  Gun 4:   API route + audit + test
  Gun 5:   Frontend cancel butonu + cancel all

HAFTA 2: Terminal Canli Data (Faz 2)
  Gun 1:   Account snapshot normalize + open orders endpoint
  Gun 2:   useAccountData hook + auto-refresh
  Gun 3:   OrderEntryPanel gercek balance + FuturesAccountPanel
  Gun 4:   Open Orders tab + Cancel butonu
  Gun 5:   Positions tab + Trade History tab

HAFTA 3: WebSocket Gateway (Faz 3)
  Gun 1-2: WsGateway server + auth + connection management
  Gun 3:   ExchangeCore -> WsGateway event push
  Gun 4:   PrivateStream -> WsGateway push + Redis pub/sub
  Gun 5:   Frontend useExchangeWebSocket + polling kaldir

HAFTA 4: Bybit + OKX (Faz 4)
  Gun 1-2: executeBybitOrder + cancelBybitOrder
  Gun 3-4: executeOkxOrder + cancelOkxOrder
  Gun 5:   Private streams + symbol registry

HAFTA 5: Production Hardening (Faz 5)
  Gun 1:   JWT auth gecisi
  Gun 2:   Nginx LB + sticky session
  Gun 3:   Redis Sentinel
  Gun 4:   Performance test (1000 concurrent)
  Gun 5:   Admin dashboards (Faz 6 baslangic)
```

---

## KONTROL LISTESI

### Faz 1 Tamamlandi Mi?
- [ ] cancelIntent() calisiyor
- [ ] Binance cancel calisiyor
- [ ] Gate.io cancel calisiyor
- [ ] Partial fill + cancel dogru handle ediliyor
- [ ] Cancel idempotency calisiyor
- [ ] Cancel audit log yaziliyor
- [ ] Frontend cancel butonu calisiyor
- [ ] Cancel all calisiyor
- [ ] State machine dogru: ACCEPTED->CANCELED, SENT->CANCELED, DONE->REJECT

### Faz 2 Tamamlandi Mi?
- [ ] Gercek balance OrderEntryPanel'de gorunuyor
- [ ] Open orders listesi canli
- [ ] Positions listesi canli
- [ ] Trade history gorunuyor
- [ ] Margin info gorunuyor
- [ ] Auto-refresh calisiyor (10s)
- [ ] Exchange degisince data yenileniyor

### Faz 3 Tamamlandi Mi?
- [ ] WS server calisiyor
- [ ] WS auth calisiyor
- [ ] Order event'leri WS ile geliyor
- [ ] Position event'leri WS ile geliyor
- [ ] Balance event'leri WS ile geliyor
- [ ] Polling kaldirildi
- [ ] Reconnect calisiyor
- [ ] Connection status indicator gorunuyor
- [ ] 1000 concurrent WS test edildi
