import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuthStore } from "./hooks/useAuthStore";

/**
 * Wraps React.lazy() with an auto-reload fallback.
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
        window.location.href =
          window.location.pathname + "?_r=" + Date.now();
        return { default: (() => null) as unknown as T };
      }
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
const CoinInsightPage = lazyRetry(() => import("./pages/CoinInsightPage"));
const PricingPage = lazyRetry(() => import("./pages/PricingPage"));
const LoginPage = lazyRetry(() => import("./pages/LoginPage"));
const SignupPage = lazyRetry(() => import("./pages/SignupPage"));
const GoogleCallbackPage = lazyRetry(() => import("./pages/GoogleCallbackPage"));
const PaymentCheckoutPage = lazyRetry(() => import("./pages/PaymentCheckoutPage"));
const AdminPaymentsPage = lazyRetry(() => import("./pages/AdminPaymentsPage"));
const SettingsPage = lazyRetry(() => import("./pages/SettingsPage"));
const AdminPage = lazyRetry(() => import("./pages/AdminPage"));
const OptimizerDashboardPage = lazyRetry(() => import("./pages/OptimizerDashboardPage"));
const SystemMonitorPage = lazyRetry(() => import("./pages/SystemMonitorPage"));
const MLExplorerPage = lazyRetry(() => import("./pages/MLExplorerPage"));
const BotPage = lazyRetry(() => import("./pages/BotPage"));
const PortfolioPage = lazyRetry(() => import("./pages/PortfolioPage"));

const PageLoader = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#F5C542] border-t-transparent" />
  </div>
);

/** Redirect to /login if not authenticated */
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

/** Redirect to /pricing if no active plan (ADMIN bypasses) */
const RequirePlan = ({ children }: { children: React.ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.hasActivePlan) return <Navigate to="/pricing" replace />;
  return <>{children}</>;
};

/** Redirect to /login if not authenticated, to / if not admin */
const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
};

function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <Routes>
      {/* Auth pages — NO sidebar */}
      <Route path="/login" element={<Suspense fallback={<PageLoader />}><LoginPage /></Suspense>} />
      <Route path="/signup" element={<Suspense fallback={<PageLoader />}><SignupPage /></Suspense>} />
      <Route path="/auth/google/callback" element={<Suspense fallback={<PageLoader />}><GoogleCallbackPage /></Suspense>} />

      {/* Main app — WITH sidebar */}
      <Route element={<AppShell />}>
        {/* Public pages — no auth required (guest accessible) */}
        <Route path="/" element={<Suspense fallback={<PageLoader />}><LandingPage /></Suspense>} />
        <Route path="/bitrium-token" element={<Suspense fallback={<PageLoader />}><BitriumTokenPage /></Suspense>} />
        <Route path="/pricing" element={<Suspense fallback={<PageLoader />}><PricingPage /></Suspense>} />

        {/* Preview pages — auth required, no plan needed (page opens but data won't load without plan) */}
        <Route path="/quant-engine" element={<RequireAuth><Suspense fallback={<PageLoader />}><MarketDashboardPage /></Suspense></RequireAuth>} />
        <Route path="/dashboard" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/exchange-terminal" element={<RequireAuth><Suspense fallback={<PageLoader />}><ExchangeTerminalPage /></Suspense></RequireAuth>} />
        <Route path="/exchanges" element={<Navigate to="/exchange-terminal" replace />} />
        <Route path="/portfolio" element={<RequireAuth><Suspense fallback={<PageLoader />}><PortfolioPage /></Suspense></RequireAuth>} />
        <Route path="/crypto-market" element={<RequireAuth><Suspense fallback={<PageLoader />}><CryptoMarketPage /></Suspense></RequireAuth>} />

        {/* Plan-gated pages — redirect to /pricing if no active subscription */}
        {/* Trade Ideas pages — admin only */}
        <Route path="/quant-trade-ideas" element={<RequireAdmin><Suspense fallback={<PageLoader />}><TradeIdeasPage /></Suspense></RequireAdmin>} />
        <Route path="/trade-ideas" element={<Navigate to="/quant-trade-ideas" replace />} />
        <Route path="/bitrium-trade-ideas" element={<Navigate to="/quant-trade-ideas" replace />} />
        <Route path="/ai-trade-ideas" element={<RequireAdmin><Suspense fallback={<PageLoader />}><TradeIdeasPage /></Suspense></RequireAdmin>} />
        <Route path="/quant-trade-ideas/report" element={<RequireAdmin><Suspense fallback={<PageLoader />}><TradeIdeasReportPage /></Suspense></RequireAdmin>} />
        <Route path="/trade-ideas/report" element={<Navigate to="/quant-trade-ideas/report" replace />} />
        <Route path="/ai-trade-ideas/report" element={<RequireAdmin><Suspense fallback={<PageLoader />}><TradeIdeasReportPage /></Suspense></RequireAdmin>} />
        <Route path="/ai-trader/leaderboard" element={<RequirePlan><Suspense fallback={<PageLoader />}><AiTraderLeaderboardPage /></Suspense></RequirePlan>} />
        <Route path="/ai-trader/dashboard" element={<RequirePlan><Suspense fallback={<PageLoader />}><AiTraderDashboardPage /></Suspense></RequirePlan>} />
        <Route path="/ai-trader/strategy" element={<RequirePlan><Suspense fallback={<PageLoader />}><AiTraderStrategyPage /></Suspense></RequirePlan>} />
        <Route path="/ai-trader/arena" element={<RequirePlan><Suspense fallback={<PageLoader />}><AiTraderComingSoonPage title="AI Trader · AI Arena" note="AI Arena module is coming soon." /></Suspense></RequirePlan>} />
        <Route path="/ai-trader/backtest" element={<RequirePlan><Suspense fallback={<PageLoader />}><AiTraderComingSoonPage title="AI Trader · Backtest" note="Backtest module is coming soon." /></Suspense></RequirePlan>} />
        <Route path="/bot" element={<RequirePlan><Suspense fallback={<PageLoader />}><BotPage /></Suspense></RequirePlan>} />
        <Route path="/coin-universe" element={<RequirePlan><Suspense fallback={<PageLoader />}><CoinUniversePage /></Suspense></RequirePlan>} />
        <Route path="/coin-insight" element={<RequirePlan><Suspense fallback={<PageLoader />}><CoinInsightPage /></Suspense></RequirePlan>} />
        <Route path="/super-charts" element={<RequirePlan><Suspense fallback={<PageLoader />}><SuperChartsPage /></Suspense></RequirePlan>} />
        <Route path="/indicators" element={<RequirePlan><Suspense fallback={<PageLoader />}><IndicatorsPage /></Suspense></RequirePlan>} />
        <Route path="/games" element={<RequirePlan><Suspense fallback={<PageLoader />}><GamesPage /></Suspense></RequirePlan>} />
        <Route path="/icon-gallery" element={<RequireAuth><Suspense fallback={<PageLoader />}><IconGalleryPage /></Suspense></RequireAuth>} />
        <Route path="/open-interest" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/funding-rate" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/liquidation" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/dex-scan" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/coin-calculator" element={<RequireAuth><Suspense fallback={<PageLoader />}><CoinCalculatorPage /></Suspense></RequireAuth>} />
        <Route path="/token-creator" element={<RequireAuth><Suspense fallback={<PageLoader />}><TokenCreatorPage /></Suspense></RequireAuth>} />
        <Route path="/checkout/:invoiceId" element={<RequireAuth><Suspense fallback={<PageLoader />}><PaymentCheckoutPage /></Suspense></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Suspense fallback={<PageLoader />}><SettingsPage /></Suspense></RequireAuth>} />

        {/* Admin sub-pages (specific routes first, then catch-all) */}
        <Route path="/admin/members" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminPage /></Suspense></RequireAdmin>} />
        <Route path="/admin/users" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminPage /></Suspense></RequireAdmin>} />
        <Route path="/admin/referrals" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminPage /></Suspense></RequireAdmin>} />
        <Route path="/admin/exchanges" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminPage /></Suspense></RequireAdmin>} />
        <Route path="/admin/trade-ideas" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminPage /></Suspense></RequireAdmin>} />
        <Route path="/admin/branding" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminPage /></Suspense></RequireAdmin>} />
        <Route path="/admin/payments" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminPage /></Suspense></RequireAdmin>} />
        <Route path="/admin/logs" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminPage /></Suspense></RequireAdmin>} />
        <Route path="/admin/bug-reports" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminPage /></Suspense></RequireAdmin>} />
        <Route path="/admin" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminPage /></Suspense></RequireAdmin>} />
        <Route path="/ai-exchange-manager" element={<Navigate to="/admin/exchanges" replace />} />
        <Route path="/optimizer" element={<RequireAdmin><Suspense fallback={<PageLoader />}><OptimizerDashboardPage /></Suspense></RequireAdmin>} />
        <Route path="/system-monitor" element={<RequireAdmin><Suspense fallback={<PageLoader />}><SystemMonitorPage /></Suspense></RequireAdmin>} />
        <Route path="/ml-explorer" element={<RequireAdmin><Suspense fallback={<PageLoader />}><MLExplorerPage /></Suspense></RequireAdmin>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
