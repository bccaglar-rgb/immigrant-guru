import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, PageBreak, LevelFormat, TableOfContents } from "docx";
import fs from "fs";

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
const headerShading = { fill: "1A1A2E", type: ShadingType.CLEAR };
const altRowShading = { fill: "F8F9FA", type: ShadingType.CLEAR };

const h = (text, level = HeadingLevel.HEADING_1) => new Paragraph({ heading: level, spacing: { before: level === HeadingLevel.HEADING_1 ? 360 : 240, after: 120 }, children: [new TextRun({ text, bold: true })] });

const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: [new TextRun({ text, size: 22, font: "Arial", ...opts.run })] });

const pb = (label, value) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${label}: `, bold: true, size: 22, font: "Arial" }), new TextRun({ text: value, size: 22, font: "Arial" })] });

const bullet = (text, ref = "bullets", level = 0) => new Paragraph({ numbering: { reference: ref, level }, spacing: { after: 60 }, children: [new TextRun({ text, size: 22, font: "Arial" })] });

const code = (text) => new Paragraph({ spacing: { after: 80 }, indent: { left: 360 }, children: [new TextRun({ text, size: 20, font: "Consolas", color: "2E3440" })] });

const makeTable = (headers, rows, colWidths) => {
  const tw = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: tw, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => new TableCell({
          borders, margins: cellMargins, shading: headerShading,
          width: { size: colWidths[i], type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, font: "Arial", color: "FFFFFF" })] })],
        })),
      }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((cell, ci) => new TableCell({
          borders, margins: cellMargins,
          width: { size: colWidths[ci], type: WidthType.DXA },
          shading: ri % 2 === 1 ? altRowShading : undefined,
          children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 20, font: "Arial" })] })],
        })),
      })),
    ],
  });
};

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, font: "Arial", color: "1A1A2E" }, paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, font: "Arial", color: "2E3B55" }, paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: "Arial", color: "3D5A80" }, paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
      ]},
      { reference: "numbers", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ]},
    ],
  },
  sections: [
    // ── COVER PAGE ──
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children: [
        new Paragraph({ spacing: { before: 3600 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "BITRIUM PLATFORM", size: 56, bold: true, font: "Arial", color: "1A1A2E" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "Technical Architecture Document", size: 36, font: "Arial", color: "3D5A80" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: "Version 2.0 \u2014 March 2026", size: 24, font: "Arial", color: "666666" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, border: { top: { style: BorderStyle.SINGLE, size: 3, color: "F5C542", space: 1 } }, children: [] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: "All-in-One Crypto Super Platform", size: 28, italics: true, font: "Arial", color: "555555" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100 }, children: [new TextRun({ text: "Quant Signals \u2022 AI Trading \u2022 Real-Time Analytics \u2022 Multi-Exchange Execution", size: 22, font: "Arial", color: "777777" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200 }, children: [new TextRun({ text: "CONFIDENTIAL", size: 20, bold: true, font: "Arial", color: "CC0000" })] }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    // ── MAIN CONTENT ──
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1200, bottom: 1440, left: 1200 } },
      },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Bitrium \u2014 Technical Architecture", size: 16, font: "Arial", color: "999999", italics: true })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Page ", size: 16, font: "Arial", color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Arial", color: "999999" })] })] }) },
      children: [
        // TOC
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 1. EXECUTIVE SUMMARY ──
        h("1. Executive Summary"),
        p("Bitrium is a production-grade cryptocurrency trading intelligence platform combining real-time market data aggregation from 4 major exchanges (Binance, Bybit, OKX, Gate.io), 50+ quantitative signal analysis, AI-driven trade idea generation, and institutional-grade order execution."),
        p("The platform runs on 5 dedicated DigitalOcean servers (AMS3 region) with PostgreSQL 16 + TimescaleDB for time-series data, Redis 7 for caching and pub/sub, and PM2 cluster mode for horizontal scaling."),
        new Paragraph({ spacing: { after: 200 } }),
        makeTable(
          ["Metric", "Value"],
          [
            ["Total Source Files", "300+ TypeScript files"],
            ["Frontend Pages", "34 pages"],
            ["Backend Routes", "23 route files"],
            ["Service Modules", "108 backend service files"],
            ["Database Migrations", "13 migration files"],
            ["Supported Exchanges", "Binance, Bybit, OKX, Gate.io"],
            ["Quant Signals", "50+ real-time tiles across 7 layers"],
            ["Scoring Modes", "FLOW, AGGRESSIVE, BALANCED, CAPITAL_GUARD"],
            ["WebSocket Pipelines", "13 real-time data pipelines"],
          ],
          [4680, 4680],
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 2. TECHNOLOGY STACK ──
        h("2. Technology Stack"),
        h("2.1 Frontend", HeadingLevel.HEADING_2),
        makeTable(
          ["Technology", "Version", "Purpose"],
          [
            ["React", "18.3.1", "UI Framework"],
            ["TypeScript", "5.6.3", "Type Safety"],
            ["Vite", "5.4.8", "Build Tool & Dev Server"],
            ["Tailwind CSS", "3.4.13", "Utility-First CSS"],
            ["Zustand", "4.5.5", "State Management (22 stores)"],
            ["lightweight-charts", "4.2.0", "TradingView-Style Candle Charts"],
            ["Recharts", "3.7.0", "Data Visualization"],
            ["Radix UI", "1.2.12+", "Headless UI Components"],
            ["Lucide React", "0.577.0", "Icon Library"],
            ["React Router", "6.30.3", "Client-Side Routing"],
          ],
          [3120, 1560, 4680],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h("2.2 Backend", HeadingLevel.HEADING_2),
        makeTable(
          ["Technology", "Version", "Purpose"],
          [
            ["Node.js", "22+", "Runtime (native ESM via tsx)"],
            ["Express", "4.21.2", "HTTP/REST Framework"],
            ["PostgreSQL", "16", "Primary Database"],
            ["TimescaleDB", "2.x", "Time-Series Extension (candle hypertables)"],
            ["Redis", "7", "Cache, Pub/Sub, Job Queue"],
            ["BullMQ", "5.71.0", "Redis-Based Job Queue"],
            ["ioredis", "5.10.0", "Redis Client"],
            ["pg", "8.20.0", "PostgreSQL Client"],
            ["ws", "8.18.0", "WebSocket Server"],
            ["AWS S3 SDK", "3.750.0", "Media Storage"],
          ],
          [3120, 1560, 4680],
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 3. INFRASTRUCTURE ──
        h("3. Infrastructure & Deployment"),
        h("3.1 Server Topology", HeadingLevel.HEADING_2),
        p("All servers are in DigitalOcean AMS3 (Amsterdam) datacenter, connected via a private VPC (10.110.0.0/20 on eth1)."),
        new Paragraph({ spacing: { after: 100 } }),
        makeTable(
          ["Server", "Public IP", "Private IP", "Role", "RAM"],
          [
            ["Bitrium (API-1)", "161.35.94.191", "10.110.0.4", "API + Nginx + SSL", "4 GB"],
            ["Bitrium-API2", "178.62.198.35", "10.110.0.8", "API Clone (Backup)", "4 GB"],
            ["Bitrium-MarketHub", "188.166.109.145", "10.110.0.7", "Market Data Hub", "4 GB"],
            ["Bitrium-DB", "146.190.228.33", "10.110.0.5", "PostgreSQL + TimescaleDB", "8 GB"],
            ["Bitrium-Redis", "159.65.202.70", "10.110.0.6", "Redis 7", "4 GB"],
          ],
          [1800, 1600, 1400, 2400, 1160],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h("3.2 Nginx Reverse Proxy", HeadingLevel.HEADING_2),
        bullet("SSL/TLS termination (Let\u2019s Encrypt)"),
        bullet("Round-robin upstream to API-1 + API-2"),
        bullet("WebSocket sticky sessions (ip_hash)"),
        bullet("Static assets served from /var/www/bitrium/dist/ (immutable cache)"),
        bullet("Security headers: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection"),
        new Paragraph({ spacing: { after: 200 } }),
        h("3.3 PM2 Process Management", HeadingLevel.HEADING_2),
        bullet("API: 3 instances (cluster mode) on port 8090, max 1500MB each"),
        bullet("Worker 0 (primary): Runs scheduler, hub, trade engine, AI engines"),
        bullet("Workers 1-2: HTTP request handling only"),
        bullet("Market Hub: 1 instance (fork mode) on port 8091, max 800MB"),
        new Paragraph({ spacing: { after: 200 } }),
        h("3.4 Domain & Network", HeadingLevel.HEADING_2),
        bullet("Domain: bitrium.com \u2192 161.35.94.191"),
        bullet("VPC: 10.110.0.0/20 (eth1) \u2014 eth0 (10.18.0.x) is broken"),
        bullet("Firewall: UFW active on API-1 (ports 22, 80, 443 only)"),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 4. BACKEND ARCHITECTURE ──
        h("4. Backend Architecture"),
        h("4.1 Service Layer Overview", HeadingLevel.HEADING_2),
        p("The backend is organized into 7 major service modules totaling 108 TypeScript files:"),
        makeTable(
          ["Service", "Files", "Location", "Purpose"],
          [
            ["Exchange Trade Engine", "27", "services/exchangeCore/", "Order execution pipeline (Faz 5-12)"],
            ["Coin Universe V2", "12+", "services/coinUniverse/", "Multi-factor coin scoring"],
            ["Optimizer Engine", "17", "services/optimizer/", "Parameter optimization"],
            ["Market Hub", "12", "services/marketHub/", "Multi-exchange market data"],
            ["Trader Hub (Bots)", "10", "services/traderHub/", "Automated bot trading"],
            ["AI Trade Ideas", "13", "engines/aiTradeIdeas/", "LLM-powered trade generation"],
            ["Payment System", "12", "payments/", "TRON crypto payments"],
          ],
          [2400, 780, 2800, 3380],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h("4.2 Exchange Trade Engine (Faz 5-12)", HeadingLevel.HEADING_2),
        p("Production-grade order execution with a 10-stage pipeline supporting 4 exchanges:"),
        new Paragraph({ spacing: { after: 100 } }),
        makeTable(
          ["Stage", "Component", "Purpose"],
          [
            ["1", "KillSwitch", "Global/exchange/user/symbol/AI trade kill switch (Redis-backed)"],
            ["2", "CircuitBreaker", "Per-exchange circuit breaker (error rate, latency)"],
            ["3", "RiskGate", "Validate notional, leverage, cooldown per user"],
            ["4", "PolicyEngine", "MANUAL_PRIORITY / AI_PRIORITY / FIRST_WINS / REJECT_CONFLICT"],
            ["5", "OrderNormalizer", "Validate qty, price, stepSize, tickSize, minNotional"],
            ["6", "RateLimiter", "Per-exchange rate limiting"],
            ["7", "ApiVault", "Encrypted credential retrieval + audit logging"],
            ["8", "TimeSync", "60s drift detection per exchange"],
            ["9", "Execute", "Submit order to Binance/Bybit/OKX/Gate.io"],
            ["10", "Reconcile", "Fill verification, balance reconciliation, trace logging"],
          ],
          [780, 2000, 6580],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h("4.3 Coin Universe Engine V2", HeadingLevel.HEADING_2),
        p("4-stage scoring pipeline ranking 100-500 coins per timeframe:"),
        bullet("Stage 1: Hard Filters (volume, volatility, blacklist)"),
        bullet("Stage 2: Multi-Factor Scoring (execution, liquidity, momentum, structure, positioning)"),
        bullet("Stage 3: False Penalty (penalize false breakouts)"),
        bullet("Stage 4: Universe Selection (top N by composite score)"),
        new Paragraph({ spacing: { after: 200 } }),
        h("4.4 Optimizer Engine", HeadingLevel.HEADING_2),
        p("Continuous optimization of trading parameters based on live trade outcomes:"),
        bullet("Mode Performance Tracker \u2014 Win rate, PnL, Sharpe per scoring mode"),
        bullet("Dynamic SL/TP Optimizer \u2014 Stop-loss and take-profit tuning"),
        bullet("Regime Parameter Engine \u2014 Market regime detection and parameter adjustment"),
        bullet("Trade Outcome Attributor \u2014 Feature contribution analysis"),
        bullet("Confidence Calibrator \u2014 Score calibration"),
        bullet("Meta-Labeling Filter \u2014 False signal detection"),
        bullet("Champions/Challenger \u2014 A/B testing of parameter sets"),
        new Paragraph({ spacing: { after: 200 } }),
        h("4.5 Market Hub", HeadingLevel.HEADING_2),
        p("Unified real-time market data aggregation from 4 exchanges:"),
        makeTable(
          ["Exchange", "Adapter Size", "Data Streams"],
          [
            ["Binance Futures", "54 KB", "Klines, Orderbook, Trades, OI, Funding, Liquidations"],
            ["Bybit Futures", "36 KB", "Klines, Orderbook, Trades, OI, Funding"],
            ["OKX Futures", "39 KB", "Klines, Orderbook, Trades, OI, Funding"],
            ["Gate.io Futures", "31 KB", "Klines, Orderbook, Trades, OI, Funding"],
          ],
          [2000, 1560, 5800],
        ),
        bullet("Health Score Router \u2014 ranks adapters by latency, uptime, staleness"),
        bullet("Event Bridge \u2014 Redis pub/sub for inter-service communication"),
        bullet("Orderflow Aggregator \u2014 cross-exchange orderflow analysis"),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 5. FRONTEND ARCHITECTURE ──
        h("5. Frontend Architecture"),
        h("5.1 Page Inventory (34 Pages)", HeadingLevel.HEADING_2),
        makeTable(
          ["Page", "File", "Description"],
          [
            ["Market Dashboard", "MarketDashboardPage.tsx (46 KB)", "Main overview with 50+ quant tiles"],
            ["Exchange Terminal", "ExchangeTerminalPage.tsx (34 KB)", "Manual trading with positions/orders"],
            ["Trade Ideas", "TradeIdeasPage.tsx (107 KB)", "AI-generated signals, live stream"],
            ["AI Trader Strategy", "AiTraderStrategyPage.tsx (128 KB)", "Bot building, backtesting"],
            ["Coin Universe", "CoinUniversePage.tsx (37 KB)", "Scored coins, rankings"],
            ["Super Charts", "SuperChartsPage.tsx (23 KB)", "Multi-chart with indicators"],
            ["Admin Panel", "AdminPage.tsx (73 KB)", "Kill switch, logs, provider config"],
            ["Settings", "SettingsPage.tsx (42 KB)", "Profile, exchange config"],
            ["System Monitor", "SystemMonitorPage.tsx", "API/DB/Redis/WS health"],
            ["ML Explorer", "MLExplorerPage.tsx", "Model inspection"],
          ],
          [2200, 3200, 3960],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h("5.2 State Management (Zustand)", HeadingLevel.HEADING_2),
        p("22 custom hooks using Zustand for lightweight reactive state:"),
        bullet("useAuthStore \u2014 Authentication state (login, profile, plan)"),
        bullet("useExchangeTerminalStore \u2014 Terminal state (balances, orders, positions)"),
        bullet("useTradeIdeasStream \u2014 Trade ideas SSE/WS stream (68 KB)"),
        bullet("useLivePriceStore \u2014 Real-time price cache (Zustand subscribe bypass)"),
        bullet("useIndicatorsStore \u2014 25 indicators across 5 groups"),
        bullet("useMarketData \u2014 Market data fetching + caching"),
        bullet("usePrivateStream \u2014 WebSocket private stream (Pipeline 8)"),
        new Paragraph({ spacing: { after: 200 } }),
        h("5.3 Consensus Engines (Client-Side)", HeadingLevel.HEADING_2),
        p("7 large scoring engines (20-70 KB each) run client-side for real-time signal generation:"),
        makeTable(
          ["Engine", "Size", "Mode"],
          [
            ["liveConsensusEngine.ts", "70 KB", "Main real-time scoring"],
            ["bitriumIntelligenceEngine.ts", "36 KB", "Core analysis (50+ tiles)"],
            ["balancedConsensus.ts", "35 KB", "BALANCED mode"],
            ["extremeConsensus.ts", "37 KB", "AGGRESSIVE mode"],
            ["capitalGuardConsensus.ts", "30 KB", "CAPITAL_GUARD mode"],
            ["velocityConsensus.ts", "21 KB", "FLOW mode"],
            ["scoringEngine.ts", "23 KB", "Scoring logic"],
          ],
          [3800, 1560, 3920],
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 6. QUANT SIGNAL LAYERS ──
        h("6. Quantitative Signal Architecture"),
        p("50+ signals organized in 7 layers, each with P1/P2/P3 priority:"),
        makeTable(
          ["Layer", "Priority", "Key Signals"],
          [
            ["Structure", "P1", "Market Regime, Trend Direction, Trend Strength, EMA Alignment, VWAP Position, Structure Age"],
            ["Microstructure (Liquidity)", "P1", "Orderbook Imbalance, Liquidity Density, Stop Cluster Probability, Aggressor Flow"],
            ["Execution", "P1", "Spread Regime, Depth Quality, Slippage Risk, Entry Timing, Entry Quality"],
            ["Positioning", "P2", "Funding Bias, OI Change, Liquidations Bias, Buy/Sell Imbalance"],
            ["Volatility", "P2", "Compression, Expansion Probability, Market Speed, ATR Regime, Breakout Risk"],
            ["Risk", "P2", "Risk Gate, Signal Conflict, Market Stress, Cascade Risk, Trap Probability"],
            ["On-Chain", "P3", "Exchange Inflow/Outflow, Whale Activity, NVT Ratio, MVRV Ratio"],
          ],
          [2200, 1000, 6160],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h("6.1 Scoring Modes", HeadingLevel.HEADING_2),
        makeTable(
          ["Mode", "Threshold", "Style"],
          [
            ["FLOW", "66+", "Opportunistic \u2014 Fast entries on momentum"],
            ["AGGRESSIVE", "60+", "High conviction \u2014 Strong signals only"],
            ["BALANCED", "56+", "Risk-aware \u2014 Even weight distribution"],
            ["CAPITAL_GUARD", "50+", "Conservative \u2014 Capital preservation first"],
          ],
          [2000, 1560, 5800],
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 7. DATABASE SCHEMA ──
        h("7. Database Schema"),
        p("13 SQL migrations totaling 793 lines, creating 20+ tables:"),
        h("7.1 Core Tables", HeadingLevel.HEADING_2),
        makeTable(
          ["Table", "Migration", "Purpose"],
          [
            ["app_users", "001", "User accounts (UUID, email, password_hash, role, 2FA)"],
            ["plans / invoices", "001", "Subscription plans and payment invoices"],
            ["candles (hypertable)", "002", "OHLCV data with TimescaleDB 7-step aggregation"],
            ["feature_snapshots", "003", "Feature values at evaluation time (compressed)"],
            ["analytics_aggregates", "004", "Pre-computed analytics per symbol/timeframe"],
            ["optimizer_evolution", "005", "Optimizer parameter history"],
            ["order_intents", "006", "Trade intents (MANUAL/AI/GRID, state machine)"],
            ["audit_events", "006", "Complete audit log with payload"],
            ["exchange_symbol_info", "006", "Symbol metadata (stepSize, tickSize, minNotional)"],
            ["order_reconciler_state", "007", "Order status tracking"],
            ["api_vaults", "008", "Encrypted exchange credentials"],
            ["execution_policies", "009", "Per-user execution policies"],
            ["filled_trades / balance_snapshots", "010", "Execution results and balance history"],
            ["wallet_addresses", "011", "TRON address pool"],
            ["logs / bug_reports", "013", "Application logs and bug reports"],
          ],
          [2800, 1200, 5360],
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 8. WEBSOCKET ARCHITECTURE ──
        h("8. WebSocket & Real-Time Streaming"),
        h("8.1 WebSocket Gateway", HeadingLevel.HEADING_2),
        pb("File", "server/src/ws/gateway.ts (37 KB)"),
        p("13 real-time data pipelines with subscription management, duplicate/stale/OOO guards:"),
        makeTable(
          ["Pipeline", "Data Type", "Update Frequency"],
          [
            ["Pipeline 1", "Kline (Candlestick) updates", "Per candle close + live forming"],
            ["Pipeline 2", "Orderbook depth snapshots", "100ms throttled"],
            ["Pipeline 3", "Live trades (aggTrades)", "Per trade"],
            ["Pipeline 4", "Open Interest changes", "1s intervals"],
            ["Pipeline 5", "Funding Rate", "Per funding period"],
            ["Pipeline 6", "Liquidations", "Per event"],
            ["Pipeline 7", "Ticker (24h stats)", "1s intervals"],
            ["Pipeline 8", "Private user data (orders, fills)", "Per event"],
          ],
          [1600, 3920, 3840],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h("8.2 Client-Side Integration", HeadingLevel.HEADING_2),
        bullet("MarketDataRouter (40 KB) \u2014 routes WS events to Zustand stores"),
        bullet("usePrivateStream hook \u2014 Pipeline 8 client for order/fill updates"),
        bullet("Smart REST fallback: WS healthy \u2192 30s polling, WS down \u2192 5s polling"),
        bullet("Stale event guard, merge-then-commit, epsilon threshold filtering"),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 9. EXCHANGE INTEGRATIONS ──
        h("9. Exchange Integrations"),
        p("Full integration with 4 major cryptocurrency exchanges:"),
        makeTable(
          ["Exchange", "Market Data", "Execution", "Private Stream", "Symbol Format"],
          [
            ["Binance", "Full (54 KB adapter)", "Full", "Full (listenKey auth)", "BTCUSDT"],
            ["Bybit", "Full (36 KB adapter)", "Full", "Full (HMAC auth)", "BTCUSDT"],
            ["OKX", "Full (39 KB adapter)", "Full", "Full (login + subscribe)", "BTC-USDT-SWAP"],
            ["Gate.io", "Full (31 KB adapter)", "Full", "Full (auth subscribe)", "BTC_USDT"],
          ],
          [1400, 2000, 1400, 2400, 2160],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h("9.1 Signing Methods", HeadingLevel.HEADING_2),
        bullet("Binance: HMAC-SHA256 with query string"),
        bullet("Bybit: HMAC-SHA256 with timestamp + API key + recv_window"),
        bullet("OKX: HMAC-SHA256 with timestamp + method + path + body (Base64)"),
        bullet("Gate.io: HMAC-SHA512 with channel + event + time"),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 10. API REFERENCE ──
        h("10. API Reference"),
        h("10.1 Authentication", HeadingLevel.HEADING_2),
        makeTable(
          ["Method", "Endpoint", "Purpose"],
          [
            ["POST", "/api/auth/register", "User registration"],
            ["POST", "/api/auth/login", "Login (returns JWT)"],
            ["POST", "/api/auth/mfa-setup", "Enable 2FA"],
            ["GET", "/api/auth/me", "Get current user profile"],
          ],
          [1000, 3600, 4760],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h("10.2 Market Data", HeadingLevel.HEADING_2),
        makeTable(
          ["Method", "Endpoint", "Purpose"],
          [
            ["GET", "/api/market/live", "Live OHLCV + orderbook + trades + derivatives"],
            ["GET", "/api/market/trade-idea", "Full tile snapshot + AI panel + mode scores"],
            ["GET", "/api/market/candles", "Historical OHLCV data"],
            ["GET", "/api/market/onchain", "On-chain metrics per symbol"],
            ["GET", "/api/market/universe", "Ranked symbol list with scores"],
            ["WS", "/ws", "Real-time streams (13 pipelines)"],
          ],
          [1000, 3600, 4760],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h("10.3 Trade Execution", HeadingLevel.HEADING_2),
        makeTable(
          ["Method", "Endpoint", "Purpose"],
          [
            ["POST", "/api/trade/submit-intent", "Submit manual trade intent"],
            ["POST", "/api/exchange-core/kill-switch/toggle", "Toggle kill switch"],
            ["GET", "/api/exchange-core/trace/:intentId", "Get execution trace"],
            ["GET", "/api/trade-ideas", "List trade ideas"],
            ["SSE", "/api/trade-ideas/stream", "Live trade idea stream"],
          ],
          [1000, 4200, 4160],
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 11. COMPLETED FEATURES ──
        h("11. Feature Roadmap & Status"),
        h("11.1 Completed", HeadingLevel.HEADING_2),
        bullet("Faz 2: TimescaleDB + Candle Aggregation (7 steps)"),
        bullet("Faz 3: Bybit + OKX Adapters (8 steps)"),
        bullet("Faz 4: Cold Storage + ML Pipeline (6 steps)"),
        bullet("Faz 5-12: Exchange Trade Engine (19 files, full pipeline)"),
        bullet("Coin Universe Engine V2 (4-stage pipeline, 12 backend + UI)"),
        bullet("Optimizer Engine (9 files, fully integrated)"),
        bullet("Bot Scaling (signalCache, botBreaker, batchResultWriter)"),
        bullet("Super Charts (per-chart TF, coin selector, indicators, volume overlay)"),
        bullet("ConnectApiModal (12 exchange logos, 2-step modal, testnet toggle)"),
        bullet("Production Deploy (all 5 servers running)"),
        new Paragraph({ spacing: { after: 200 } }),
        h("11.2 Pending", HeadingLevel.HEADING_2),
        bullet("Faz 5: JWT auth, encryption key KMS, WS token auth"),
        bullet("Faz 6: Admin UI \u2014 Kill switch panel, Trade Trace viewer, Circuit Breaker dashboard"),
        bullet("Nginx load balancer (API-1 + API-2)"),
        bullet("SSL cert renewal automation"),
        bullet("Firewall (UFW) on all servers"),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 12. SECURITY ──
        h("12. Security Architecture"),
        bullet("API credentials encrypted at rest in api_vaults table"),
        bullet("Credential access audit logging (credential_audit table)"),
        bullet("Per-user risk limits (max_notional, max_leverage, cooldown)"),
        bullet("Kill switch system with 5 levels (GLOBAL, EXCHANGE, USER, SYMBOL, AI_ONLY)"),
        bullet("Circuit breaker per exchange (error rate, latency monitoring)"),
        bullet("UFW firewall on API-1 (ports 22, 80, 443 only)"),
        bullet("SSL/TLS via Let\u2019s Encrypt"),
        bullet("CORS configuration for trusted origins"),
        bullet("Rate limiting middleware on all API routes"),
        bullet("JWT-based authentication with session management"),

        new Paragraph({ spacing: { before: 600 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC", space: 1 } }, children: [] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: "End of Document", size: 20, font: "Arial", color: "999999", italics: true })] }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync("/Users/burakcagdascaglar/Claude/Bitrium/docs/Bitrium-Technical-Architecture.docx", buffer);
console.log("DONE: Bitrium-Technical-Architecture.docx created");
