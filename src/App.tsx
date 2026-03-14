import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import AdminPage from "./pages/AdminPage";
import BitriumTokenPage from "./pages/BitriumTokenPage";
import CryptoMarketPage from "./pages/CryptoMarketPage";
import CoinCalculatorPage from "./pages/CoinCalculatorPage";
import ExchangeTerminalPage from "./pages/ExchangeTerminalPage";
import GamesPage from "./pages/GamesPage";
import IndicatorsPage from "./pages/IndicatorsPage";
import IconGalleryPage from "./pages/IconGalleryPage";
import AiTraderLeaderboardPage from "./pages/AiTraderLeaderboardPage";
import AiTraderDashboardPage from "./pages/AiTraderDashboardPage";
import AiTraderStrategyPage from "./pages/AiTraderStrategyPage";
import AiTraderComingSoonPage from "./pages/AiTraderComingSoonPage";
import MarketDashboardPage from "./pages/MarketDashboardPage";
import PricingPage from "./pages/PricingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import PaymentCheckoutPage from "./pages/PaymentCheckoutPage";
import AdminPaymentsPage from "./pages/AdminPaymentsPage";
import SettingsPage from "./pages/SettingsPage";
import SuperChartsPage from "./pages/SuperChartsPage";
import TokenCreatorPage from "./pages/TokenCreatorPage";
import TradeIdeasPage from "./pages/TradeIdeasPage";
import TradeIdeasReportPage from "./pages/TradeIdeasReportPage";

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/quant-engine" element={<MarketDashboardPage />} />
        <Route path="/dashboard" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/exchange-terminal" element={<ExchangeTerminalPage />} />
        <Route path="/exchanges" element={<Navigate to="/exchange-terminal" replace />} />
        <Route path="/crypto-market" element={<CryptoMarketPage />} />
        <Route path="/super-charts" element={<SuperChartsPage />} />
        <Route path="/trade-ideas" element={<TradeIdeasPage />} />
        <Route path="/bitrium-trade-ideas" element={<Navigate to="/trade-ideas" replace />} />
        <Route path="/bitrium-trade-ideas" element={<Navigate to="/trade-ideas" replace />} />
        <Route path="/ai-trade-ideas" element={<TradeIdeasPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/trade-ideas/report" element={<TradeIdeasReportPage />} />
        <Route path="/ai-trade-ideas/report" element={<TradeIdeasReportPage />} />
        <Route path="/ai-trader/leaderboard" element={<AiTraderLeaderboardPage />} />
        <Route path="/ai-trader/dashboard" element={<AiTraderDashboardPage />} />
        <Route path="/ai-trader/strategy" element={<AiTraderStrategyPage />} />
        <Route path="/ai-trader/arena" element={<AiTraderComingSoonPage title="AI Trader · AI Arena" note="AI Arena module is coming soon." />} />
        <Route path="/ai-trader/backtest" element={<AiTraderComingSoonPage title="AI Trader · Backtest" note="Backtest module is coming soon." />} />
        <Route path="/indicators" element={<IndicatorsPage />} />
        <Route path="/icon-gallery" element={<IconGalleryPage />} />
        <Route path="/open-interest" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/funding-rate" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/liquidation" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/dex-scan" element={<Navigate to="/quant-engine" replace />} />
        <Route path="/bitrium-token" element={<BitriumTokenPage />} />
        <Route path="/bitrium-token" element={<Navigate to="/bitrium-token" replace />} />
        <Route path="/coin-calculator" element={<CoinCalculatorPage />} />
        <Route path="/token-creator" element={<TokenCreatorPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/checkout/:invoiceId" element={<PaymentCheckoutPage />} />
        <Route path="/admin/payments" element={<AdminPaymentsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/ai-exchange-manager" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/" element={<Navigate to="/quant-engine" replace />} />
        <Route path="*" element={<Navigate to="/quant-engine" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
