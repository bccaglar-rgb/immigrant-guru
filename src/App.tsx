import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";

const MarketDashboardPage = lazy(() => import("./pages/MarketDashboardPage"));
const ExchangeTerminalPage = lazy(() => import("./pages/ExchangeTerminalPage"));
const CryptoMarketPage = lazy(() => import("./pages/CryptoMarketPage"));
const SuperChartsPage = lazy(() => import("./pages/SuperChartsPage"));
const TradeIdeasPage = lazy(() => import("./pages/TradeIdeasPage"));
const TradeIdeasReportPage = lazy(() => import("./pages/TradeIdeasReportPage"));
const GamesPage = lazy(() => import("./pages/GamesPage"));
const AiTraderLeaderboardPage = lazy(() => import("./pages/AiTraderLeaderboardPage"));
const AiTraderDashboardPage = lazy(() => import("./pages/AiTraderDashboardPage"));
const AiTraderStrategyPage = lazy(() => import("./pages/AiTraderStrategyPage"));
const AiTraderComingSoonPage = lazy(() => import("./pages/AiTraderComingSoonPage"));
const IndicatorsPage = lazy(() => import("./pages/IndicatorsPage"));
const IconGalleryPage = lazy(() => import("./pages/IconGalleryPage"));
const BitriumTokenPage = lazy(() => import("./pages/BitriumTokenPage"));
const CoinCalculatorPage = lazy(() => import("./pages/CoinCalculatorPage"));
const TokenCreatorPage = lazy(() => import("./pages/TokenCreatorPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const PaymentCheckoutPage = lazy(() => import("./pages/PaymentCheckoutPage"));
const AdminPaymentsPage = lazy(() => import("./pages/AdminPaymentsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

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
        <Route path="/super-charts" element={<Suspense fallback={<PageLoader />}><SuperChartsPage /></Suspense>} />
        <Route path="/trade-ideas" element={<Suspense fallback={<PageLoader />}><TradeIdeasPage /></Suspense>} />
        <Route path="/bitrium-trade-ideas" element={<Navigate to="/trade-ideas" replace />} />
        <Route path="/ai-trade-ideas" element={<Suspense fallback={<PageLoader />}><TradeIdeasPage /></Suspense>} />
        <Route path="/games" element={<Suspense fallback={<PageLoader />}><GamesPage /></Suspense>} />
        <Route path="/trade-ideas/report" element={<Suspense fallback={<PageLoader />}><TradeIdeasReportPage /></Suspense>} />
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
        <Route path="/" element={<Navigate to="/quant-engine" replace />} />
        <Route path="*" element={<Navigate to="/quant-engine" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
