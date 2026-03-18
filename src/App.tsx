import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";

/**
 * Wraps React.lazy() with an auto-reload fallback.
 * After a deploy, old JS chunk hashes no longer exist on the server (rsync --delete).
 * If a dynamic import fails (404), we force a full page reload so the browser
 * picks up the new index.html with fresh chunk references.
 * Uses per-URL sessionStorage flags so navigating to different pages retries independently.
 */
function lazyRetry<T extends ComponentType<any>>(importFn: () => Promise<{ default: T }>) {
  return lazy(async () => {
    const key = `chunk-retry:${window.location.pathname}`;
    try {
      const module = await importFn();
      sessionStorage.removeItem(key);
      return module;
    } catch {
      const retried = Number(sessionStorage.getItem(key) ?? 0);
      if (retried < 2) {
        sessionStorage.setItem(key, String(retried + 1));
        // Hard reload — bypass browser cache to pick up fresh index.html
        window.location.href =
          window.location.pathname + "?_r=" + Date.now();
        // Return a placeholder while browser navigates
        return { default: (() => null) as unknown as T };
      }
      // All retries exhausted — render nothing (vite:preloadError handler may also catch this)
      return { default: (() => null) as unknown as T };
    }
  });
}

const LandingPage = lazyRetry(() => import("./pages/LandingPage"));
const MarketDashboardPage = lazyRetry(() => import("./pages/MarketDashboardPage"));
const ExchangeTerminalPage = lazyRetry(() => import("./pages/ExchangeTerminalPage"));
const CryptoMarketPage = lazyRetry(() => import("./pages/CryptoMarketPage"));
const SuperChartsPage = lazyRetry(() => import("./pages/SuperChartsPage"));
const TradeIdeasPage = lazyRetry(() => import("./pages/TradeIdeasPage"));
const TradeIdeasReportPage = lazyRetry(() => import("./pages/TradeIdeasReportPage"));
const GamesPage = lazyRetry(() => import("./pages/GamesPage"));
const AiTraderLeaderboardPage = lazyRetry(() => import("./pages/AiTraderLeaderboardPage"));
const AiTraderDashboardPage = lazyRetry(() => import("./pages/AiTraderDashboardPage"));
const AiTraderStrategyPage = lazyRetry(() => import("./pages/AiTraderStrategyPage"));
const AiTraderComingSoonPage = lazyRetry(() => import("./pages/AiTraderComingSoonPage"));
const IndicatorsPage = lazyRetry(() => import("./pages/IndicatorsPage"));
const IconGalleryPage = lazyRetry(() => import("./pages/IconGalleryPage"));
const BitriumTokenPage = lazyRetry(() => import("./pages/BitriumTokenPage"));
const CoinCalculatorPage = lazyRetry(() => import("./pages/CoinCalculatorPage"));
const TokenCreatorPage = lazyRetry(() => import("./pages/TokenCreatorPage"));
const CoinUniversePage = lazyRetry(() => import("./pages/CoinUniversePage"));
const PricingPage = lazyRetry(() => import("./pages/PricingPage"));
const LoginPage = lazyRetry(() => import("./pages/LoginPage"));
const SignupPage = lazyRetry(() => import("./pages/SignupPage"));
const PaymentCheckoutPage = lazyRetry(() => import("./pages/PaymentCheckoutPage"));
const AdminPaymentsPage = lazyRetry(() => import("./pages/AdminPaymentsPage"));
const SettingsPage = lazyRetry(() => import("./pages/SettingsPage"));
const AdminPage = lazyRetry(() => import("./pages/AdminPage"));

const PageLoader = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#F5C542] border-t-transparent" />
  </div>
);

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/quant-engine" element={<Suspense fallback={<PageLoader />}><MarketDashboardPage /></Suspense>} />
        <Route path="/dashboard" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/exchange-terminal" element={<Suspense fallback={<PageLoader />}><ExchangeTerminalPage /></Suspense>} />
        <Route path="/exchanges" element={<Navigate to="/exchange-terminal" replace />} />
        <Route path="/crypto-market" element={<Suspense fallback={<PageLoader />}><CryptoMarketPage /></Suspense>} />
        <Route path="/coin-universe" element={<Suspense fallback={<PageLoader />}><CoinUniversePage /></Suspense>} />
        <Route path="/super-charts" element={<Suspense fallback={<PageLoader />}><SuperChartsPage /></Suspense>} />
        <Route path="/quant-trade-ideas" element={<Suspense fallback={<PageLoader />}><TradeIdeasPage /></Suspense>} />
        <Route path="/trade-ideas" element={<Navigate to="/quant-trade-ideas" replace />} />
        <Route path="/bitrium-trade-ideas" element={<Navigate to="/quant-trade-ideas" replace />} />
        <Route path="/ai-trade-ideas" element={<Suspense fallback={<PageLoader />}><TradeIdeasPage /></Suspense>} />
        <Route path="/games" element={<Suspense fallback={<PageLoader />}><GamesPage /></Suspense>} />
        <Route path="/quant-trade-ideas/report" element={<Suspense fallback={<PageLoader />}><TradeIdeasReportPage /></Suspense>} />
        <Route path="/trade-ideas/report" element={<Navigate to="/quant-trade-ideas/report" replace />} />
        <Route path="/ai-trade-ideas/report" element={<Suspense fallback={<PageLoader />}><TradeIdeasReportPage /></Suspense>} />
        <Route path="/ai-trader/leaderboard" element={<Suspense fallback={<PageLoader />}><AiTraderLeaderboardPage /></Suspense>} />
        <Route path="/ai-trader/dashboard" element={<Suspense fallback={<PageLoader />}><AiTraderDashboardPage /></Suspense>} />
        <Route path="/ai-trader/strategy" element={<Suspense fallback={<PageLoader />}><AiTraderStrategyPage /></Suspense>} />
        <Route path="/ai-trader/arena" element={<Suspense fallback={<PageLoader />}><AiTraderComingSoonPage title="AI Trader · AI Arena" note="AI Arena module is coming soon." /></Suspense>} />
        <Route path="/ai-trader/backtest" element={<Suspense fallback={<PageLoader />}><AiTraderComingSoonPage title="AI Trader · Backtest" note="Backtest module is coming soon." /></Suspense>} />
        <Route path="/indicators" element={<Suspense fallback={<PageLoader />}><IndicatorsPage /></Suspense>} />
        <Route path="/icon-gallery" element={<Suspense fallback={<PageLoader />}><IconGalleryPage /></Suspense>} />
        <Route path="/open-interest" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/funding-rate" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/liquidation" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/dex-scan" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/bitrium-token" element={<Suspense fallback={<PageLoader />}><BitriumTokenPage /></Suspense>} />
        <Route path="/coin-calculator" element={<Suspense fallback={<PageLoader />}><CoinCalculatorPage /></Suspense>} />
        <Route path="/token-creator" element={<Suspense fallback={<PageLoader />}><TokenCreatorPage /></Suspense>} />
        <Route path="/pricing" element={<Suspense fallback={<PageLoader />}><PricingPage /></Suspense>} />
        <Route path="/login" element={<Suspense fallback={<PageLoader />}><LoginPage /></Suspense>} />
        <Route path="/signup" element={<Suspense fallback={<PageLoader />}><SignupPage /></Suspense>} />
        <Route path="/checkout/:invoiceId" element={<Suspense fallback={<PageLoader />}><PaymentCheckoutPage /></Suspense>} />
        <Route path="/admin/payments" element={<Suspense fallback={<PageLoader />}><AdminPaymentsPage /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
        <Route path="/ai-exchange-manager" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<Suspense fallback={<PageLoader />}><AdminPage /></Suspense>} />
        <Route path="/" element={<Suspense fallback={<PageLoader />}><LandingPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
