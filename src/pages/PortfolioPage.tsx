import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getExchangeBranding } from "../data/branding";
import { authHeaders } from "../services/exchangeApi";
import type { BalanceItem, PositionItem } from "../types/exchange";

/* ════════════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════════════ */

interface PortfolioAccount {
  connectionId?: string;
  exchangeId: string;
  exchangeDisplayName: string;
  accountName: string;
  status: string;
  enabled: boolean;
  environment?: string;
  balances: BalanceItem[];
  spotBalances?: BalanceItem[];
  positions: PositionItem[];
  openOrders: Array<Record<string, unknown>>;
  fetchedAt: string;
  error?: string;
}

interface AggregatedAsset {
  asset: string;
  totalAmount: number;
  availableAmount: number;
  usdValue: number;
  exchanges: string[];
  accountsCount: number;
  breakdown: Array<{
    exchangeDisplayName: string;
    accountName: string;
    amount: number;
    available: number;
  }>;
}

interface ExchangeGroup {
  exchangeId: string;
  exchangeDisplayName: string;
  iconUrl: string;
  totalValue: number;
  availableValue: number;
  accounts: PortfolioAccount[];
  assetsCount: number;
  positionsCount: number;
}

type SortKey = "exchange" | "accountName" | "totalValue" | "available" | "assets" | "positions" | "status";
type SortDir = "asc" | "desc";
type AssetSortKey = "asset" | "totalAmount" | "usdValue" | "allocation" | "accountsCount";

/* ════════════════════════════════════════════════════════════════
   Constants & Helpers
   ════════════════════════════════════════════════════════════════ */

const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "DAI", "TUSD", "USDP", "USD"]);
const SMALL_BALANCE_THRESHOLD = 1; // USD

const CHART_COLORS = [
  "#F5C542", "#4ecdc4", "#ff6b6b", "#a78bfa", "#22c55e",
  "#3b82f6", "#f472b6", "#f97316", "#06b6d4", "#eab308",
  "#6366f1", "#14b8a6", "#ef4444", "#8b5cf6",
];

const estimateUsdValue = (asset: string, total: number): number => {
  if (STABLECOINS.has(asset.toUpperCase())) return total;
  // For non-stablecoin assets in futures accounts, total is often USDT-denominated
  // Return total as-is; real price conversion would need a price feed
  return total;
};

const accountTotalUsd = (account: PortfolioAccount): number =>
  [...account.balances, ...(account.spotBalances ?? [])].reduce((sum, b) => sum + estimateUsdValue(b.asset, b.total), 0);

const accountAvailableUsd = (account: PortfolioAccount): number =>
  [...account.balances, ...(account.spotBalances ?? [])].reduce((sum, b) => sum + estimateUsdValue(b.asset, b.available), 0);

const fmt = (n: number, decimals = 2): string => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(decimals)}`;
};

const fmtFull = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtNum = (n: number, decimals = 4): string =>
  n < 0.0001 && n > 0 ? n.toExponential(2) : n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals });

const relTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

/* ════════════════════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════════════════════ */

const StatCard = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) => (
  <div className="rounded-xl border border-white/10 bg-[#0F1012] p-4 transition-all hover:border-[#F5C542]/30">
    <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">{label}</p>
    <p className={`mt-1 text-xl font-semibold ${accent ? "text-[var(--accent)]" : "text-white"}`}>{value}</p>
    {sub && <p className="mt-0.5 text-xs text-[#6B6F76]">{sub}</p>}
  </div>
);

const DonutChart = ({ slices, size = 120 }: { slices: Array<{ label: string; value: number; color: string }>; size?: number }) => {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return <div className="flex items-center justify-center text-xs text-[#6B6F76]" style={{ width: size, height: size }}>No data</div>;
  let cumPct = 0;
  const gradientStops = slices.map((sl) => {
    const start = cumPct;
    const pct = (sl.value / total) * 100;
    cumPct += pct;
    return `${sl.color} ${start}% ${cumPct}%`;
  });
  return (
    <div className="flex items-start gap-4">
      <div
        className="shrink-0 rounded-full"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${gradientStops.join(", ")})`,
          mask: `radial-gradient(circle ${size * 0.32}px at center, transparent 99%, white 100%)`,
          WebkitMask: `radial-gradient(circle ${size * 0.32}px at center, transparent 99%, white 100%)`,
        }}
      />
      <div className="flex flex-col gap-1.5 pt-1">
        {slices.map((sl) => (
          <div key={sl.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sl.color }} />
            <span className="text-[#BFC2C7]">{sl.label}</span>
            <span className="ml-auto text-[#6B6F76]">{total > 0 ? ((sl.value / total) * 100).toFixed(1) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const s = status.toUpperCase();
  const isOk = s === "READY" || s === "CONNECTED";
  const isError = s === "ERROR" || s === "FAILED" || s === "DISCONNECTED";
  const cls = isOk
    ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"
    : isError
      ? "border-[#704844] bg-[#271a19] text-[#d6b3af]"
      : "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]";
  const label = isOk ? "Connected" : isError ? (s === "FAILED" ? "Failed" : s === "DISCONNECTED" ? "Disconnected" : "Error") : "Syncing";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
};

const SkeletonRow = () => (
  <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-[#0F1012] p-3">
    <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
    <div className="flex-1 space-y-2">
      <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
      <div className="h-2 w-20 animate-pulse rounded bg-white/10" />
    </div>
    <div className="h-4 w-16 animate-pulse rounded bg-white/10" />
  </div>
);

const EmptyState = ({ onConnect }: { onConnect: () => void }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#121316] px-8 py-16 text-center">
    <div className="mb-4 inline-grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-[#0F1012]">
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M16 14h.01" />
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-white">Connect your first exchange</h3>
    <p className="mt-2 max-w-sm text-sm text-[#BFC2C7]">
      Link your exchange API to view balances, accounts, and portfolio analytics.
    </p>
    <button
      onClick={onConnect}
      className="mt-6 rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-[#0B0B0C] transition-colors hover:bg-[var(--accent)]/90"
    >
      Connect Exchange
    </button>
  </div>
);

/* ════════════════════════════════════════════════════════════════
   Main Page
   ════════════════════════════════════════════════════════════════ */

export default function PortfolioPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters
  const [filterExchange, setFilterExchange] = useState<string>("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [hideSmall, setHideSmall] = useState(false);

  // Sort
  const [accountSort, setAccountSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "totalValue", dir: "desc" });
  const [assetSort, setAssetSort] = useState<{ key: AssetSortKey; dir: SortDir }>({ key: "usdValue", dir: "desc" });

  // Expand states
  const [expandedExchanges, setExpandedExchanges] = useState<Set<string>>(new Set());
  const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set());

  // Active tab
  const [activeTab, setActiveTab] = useState<"overview" | "assets" | "positions">("overview");

  /* ── Fetch ── */
  useEffect(() => {
    let cancelled = false;
    const fetchPortfolio = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/portfolio", { headers: { ...authHeaders() } });
        if (!res.ok) throw new Error("Failed to fetch portfolio");
        const body = await res.json();
        if (!cancelled) {
          setAccounts(body.accounts ?? []);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Failed to load portfolio");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchPortfolio();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  /* ── Aggregations ── */
  const totalValue = useMemo(() => accounts.reduce((s, a) => s + accountTotalUsd(a), 0), [accounts]);
  const totalAvailable = useMemo(() => accounts.reduce((s, a) => s + accountAvailableUsd(a), 0), [accounts]);
  const totalInUse = totalValue - totalAvailable;
  const totalPositions = useMemo(() => accounts.reduce((s, a) => s + (a.positions?.length ?? 0), 0), [accounts]);
  const uniqueExchanges = useMemo(() => [...new Set(accounts.map((a) => a.exchangeId))], [accounts]);
  const totalAccounts = accounts.length;

  // Exchange groups
  const exchangeGroups = useMemo<ExchangeGroup[]>(() => {
    const map = new Map<string, PortfolioAccount[]>();
    for (const acc of accounts) {
      const key = acc.exchangeId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(acc);
    }
    return [...map.entries()].map(([exchangeId, accs]) => {
      const branding = getExchangeBranding(exchangeId);
      const allBalances = accs.flatMap((a) => [...a.balances, ...(a.spotBalances ?? [])]);
      const allPositions = accs.flatMap((a) => a.positions ?? []);
      const uniqueAssets = new Set(allBalances.map((b) => b.asset));
      return {
        exchangeId,
        exchangeDisplayName: accs[0].exchangeDisplayName,
        iconUrl: branding.iconUrl,
        totalValue: accs.reduce((s, a) => s + accountTotalUsd(a), 0),
        availableValue: accs.reduce((s, a) => s + accountAvailableUsd(a), 0),
        accounts: accs,
        assetsCount: uniqueAssets.size,
        positionsCount: allPositions.length,
      };
    }).sort((a, b) => b.totalValue - a.totalValue);
  }, [accounts]);

  // Aggregated assets
  const aggregatedAssets = useMemo<AggregatedAsset[]>(() => {
    const map = new Map<string, AggregatedAsset>();
    for (const acc of accounts) {
      for (const bal of [...acc.balances, ...(acc.spotBalances ?? [])]) {
        const existing = map.get(bal.asset);
        if (existing) {
          existing.totalAmount += bal.total;
          existing.availableAmount += bal.available;
          existing.usdValue += estimateUsdValue(bal.asset, bal.total);
          if (!existing.exchanges.includes(acc.exchangeDisplayName)) existing.exchanges.push(acc.exchangeDisplayName);
          existing.accountsCount += 1;
          existing.breakdown.push({ exchangeDisplayName: acc.exchangeDisplayName, accountName: acc.accountName, amount: bal.total, available: bal.available });
        } else {
          map.set(bal.asset, {
            asset: bal.asset,
            totalAmount: bal.total,
            availableAmount: bal.available,
            usdValue: estimateUsdValue(bal.asset, bal.total),
            exchanges: [acc.exchangeDisplayName],
            accountsCount: 1,
            breakdown: [{ exchangeDisplayName: acc.exchangeDisplayName, accountName: acc.accountName, amount: bal.total, available: bal.available }],
          });
        }
      }
    }
    let result = [...map.values()];
    if (hideSmall) result = result.filter((a) => Math.abs(a.usdValue) >= SMALL_BALANCE_THRESHOLD);
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      result = result.filter((a) => a.asset.toLowerCase().includes(q));
    }
    return result;
  }, [accounts, hideSmall, filterSearch]);

  // All positions flat
  const allPositions = useMemo(
    () => accounts.flatMap((acc) => (acc.positions ?? []).map((p) => ({ ...p, exchangeDisplayName: acc.exchangeDisplayName, accountName: acc.accountName }))),
    [accounts],
  );

  // Unique assets count
  const uniqueAssetsCount = useMemo(() => new Set(accounts.flatMap((a) => [...a.balances, ...(a.spotBalances ?? [])].map((b) => b.asset))).size, [accounts]);

  // Activity events (generated from data)
  const activityEvents = useMemo(() => {
    const events: Array<{ type: string; message: string; time: string }> = [];
    for (const acc of accounts) {
      events.push({
        type: acc.error ? "error" : "sync",
        message: acc.error ? `Unable to sync ${acc.exchangeDisplayName} · ${acc.accountName}` : `${acc.exchangeDisplayName} · ${acc.accountName} synced`,
        time: acc.fetchedAt,
      });
    }
    return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10);
  }, [accounts]);

  // Chart slices
  const exchangeSlices = useMemo(
    () => exchangeGroups.map((g, i) => ({ label: g.exchangeDisplayName, value: g.totalValue, color: CHART_COLORS[i % CHART_COLORS.length] })),
    [exchangeGroups],
  );

  const assetSlices = useMemo(() => {
    const sorted = [...aggregatedAssets].sort((a, b) => b.usdValue - a.usdValue);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6);
    const slices = top.map((a, i) => ({ label: a.asset, value: a.usdValue, color: CHART_COLORS[i % CHART_COLORS.length] }));
    if (rest.length > 0) {
      const otherTotal = rest.reduce((s, a) => s + a.usdValue, 0);
      slices.push({ label: "Others", value: otherTotal, color: "#555" });
    }
    return slices;
  }, [aggregatedAssets]);

  /* ── Sort helpers ── */
  const toggleAccountSort = (key: SortKey) =>
    setAccountSort((prev) => ({ key, dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc" }));

  const toggleAssetSort = (key: AssetSortKey) =>
    setAssetSort((prev) => ({ key, dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc" }));

  const sortedAccounts = useMemo(() => {
    let list = [...accounts];
    if (filterExchange !== "all") list = list.filter((a) => a.exchangeId === filterExchange);
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      list = list.filter((a) => a.accountName.toLowerCase().includes(q) || a.exchangeDisplayName.toLowerCase().includes(q));
    }
    const { key, dir } = accountSort;
    list.sort((a, b) => {
      let cmp = 0;
      if (key === "exchange") cmp = a.exchangeDisplayName.localeCompare(b.exchangeDisplayName);
      else if (key === "accountName") cmp = a.accountName.localeCompare(b.accountName);
      else if (key === "totalValue") cmp = accountTotalUsd(a) - accountTotalUsd(b);
      else if (key === "available") cmp = accountAvailableUsd(a) - accountAvailableUsd(b);
      else if (key === "assets") cmp = a.balances.length - b.balances.length;
      else if (key === "positions") cmp = (a.positions?.length ?? 0) - (b.positions?.length ?? 0);
      else if (key === "status") cmp = a.status.localeCompare(b.status);
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [accounts, accountSort, filterExchange, filterSearch]);

  const sortedAssets = useMemo(() => {
    const list = [...aggregatedAssets];
    const { key, dir } = assetSort;
    list.sort((a, b) => {
      let cmp = 0;
      if (key === "asset") cmp = a.asset.localeCompare(b.asset);
      else if (key === "totalAmount") cmp = a.totalAmount - b.totalAmount;
      else if (key === "usdValue") cmp = a.usdValue - b.usdValue;
      else if (key === "allocation") cmp = a.usdValue - b.usdValue;
      else if (key === "accountsCount") cmp = a.accountsCount - b.accountsCount;
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [aggregatedAssets, assetSort]);

  const toggleExchange = (id: string) =>
    setExpandedExchanges((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAsset = (asset: string) =>
    setExpandedAssets((prev) => {
      const next = new Set(prev);
      next.has(asset) ? next.delete(asset) : next.add(asset);
      return next;
    });

  const SortArrow = ({ active, dir }: { active: boolean; dir: SortDir }) => (
    <span className={`ml-1 text-[10px] ${active ? "text-[var(--accent)]" : "text-[#6B6F76]"}`}>{active ? (dir === "asc" ? "\u25B2" : "\u25BC") : "\u25BC"}</span>
  );

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
        <div className="space-y-1">
          <div className="h-7 w-40 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-80 animate-pulse rounded bg-white/10" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-[#0F1012] p-4">
              <div className="h-2.5 w-16 animate-pulse rounded bg-white/10" />
              <div className="mt-2 h-5 w-20 animate-pulse rounded bg-white/10" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    );
  }

  /* ── Empty ── */
  if (!accounts.length && !error) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Portfolio</h1>
          <p className="mt-1 text-sm text-[#BFC2C7]">
            Monitor balances, connected exchange accounts, asset allocations, and portfolio exposure across all linked APIs.
          </p>
        </div>
        <EmptyState onConnect={() => navigate("/exchange-terminal")} />
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Portfolio</h1>
          <p className="mt-1 text-sm text-[#BFC2C7]">
            Monitor balances, connected exchange accounts, asset allocations, and portfolio exposure across all linked APIs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#6B6F76]">Data is pulled from your connected exchange APIs</span>
          <button onClick={refresh} className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7] transition hover:border-[var(--accent)]/40 hover:text-white">
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="rounded-xl border border-[#704844] bg-[#271a19] px-4 py-3 text-sm text-[#d6b3af]">
          {error}
          <button onClick={refresh} className="ml-3 text-xs underline hover:text-white">Retry</button>
        </div>
      )}

      {/* ── A. Top Level Overview Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Total Portfolio Value" value={fmtFull(totalValue)} accent />
        <StatCard label="24h Change" value="--" sub="Historical tracking pending" />
        <StatCard label="Connected Exchanges" value={String(uniqueExchanges.length)} />
        <StatCard label="Connected Accounts" value={String(totalAccounts)} />
        <StatCard label="Total Assets" value={String(uniqueAssetsCount)} />
        <StatCard label="Open Positions" value={String(totalPositions)} />
        <StatCard label="Available Balance" value={fmt(totalAvailable)} />
        <StatCard label="In Use / Allocated" value={fmt(totalInUse)} />
      </div>

      {/* ── B. Portfolio Distribution ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#121316] p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Exchange Allocation</h3>
          {exchangeSlices.length > 0 ? <DonutChart slices={exchangeSlices} /> : <p className="text-xs text-[#6B6F76]">No exchange data</p>}
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#121316] p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Asset Allocation</h3>
          {assetSlices.length > 0 ? <DonutChart slices={assetSlices} /> : <p className="text-xs text-[#6B6F76]">No asset data</p>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-px">
        {(["overview", "assets", "positions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-white/10 bg-[#121316] text-white"
                : "border-transparent text-[#6B6F76] hover:text-[#BFC2C7]"
            }`}
          >
            {tab === "overview" ? "Overview" : tab === "assets" ? "Assets" : "Positions"}
            {tab === "positions" && totalPositions > 0 && (
              <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{totalPositions}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterExchange}
          onChange={(e) => setFilterExchange(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7] outline-none focus:border-[var(--accent)]/50"
        >
          <option value="all">All Exchanges</option>
          {uniqueExchanges.map((ex) => (
            <option key={ex} value={ex}>{accounts.find((a) => a.exchangeId === ex)?.exchangeDisplayName ?? ex}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search assets or accounts..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7] outline-none placeholder:text-[#6B6F76] focus:border-[var(--accent)]/50"
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#6B6F76]">
          <input type="checkbox" checked={hideSmall} onChange={(e) => setHideSmall(e.target.checked)} className="accent-[var(--accent)]" />
          Hide small balances
        </label>
      </div>

      {/* ════ OVERVIEW TAB ════ */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* ── C. Connected Exchanges Section ── */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Connected Exchanges</h2>
            {exchangeGroups.map((group) => {
              const open = expandedExchanges.has(group.exchangeId);
              return (
                <div key={group.exchangeId} className="rounded-2xl border border-white/10 bg-[#121316] overflow-hidden">
                  {/* Exchange Header */}
                  <button
                    onClick={() => toggleExchange(group.exchangeId)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#17191d]"
                  >
                    <img src={group.iconUrl} alt="" className="h-7 w-7 rounded-full" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">{group.exchangeDisplayName}</p>
                      <p className="text-[10px] text-[#6B6F76]">{group.accounts.length} account{group.accounts.length > 1 ? "s" : ""} · {group.assetsCount} assets · {group.positionsCount} positions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">{fmtFull(group.totalValue)}</p>
                      <p className="text-[10px] text-[#6B6F76]">Available: {fmt(group.availableValue)}</p>
                    </div>
                    <svg className={`h-4 w-4 shrink-0 text-[#6B6F76] transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                  </button>

                  {/* Accounts under this exchange */}
                  {open && (
                    <div className="border-t border-white/5 bg-[#0F1012]">
                      {group.accounts.map((acc) => (
                        <div key={`${acc.exchangeId}::${acc.accountName}`} className="flex items-center gap-3 border-b border-white/5 px-6 py-3 last:border-b-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-white">{acc.accountName}</p>
                              <StatusBadge status={acc.status} />
                              {acc.environment === "testnet" && (
                                <span className="rounded border border-[#7a6840] bg-[#2a2418] px-1.5 py-0.5 text-[9px] font-semibold text-[#e7d9b3]">TESTNET</span>
                              )}
                            </div>
                            <p className="text-[10px] text-[#6B6F76]">
                              {acc.balances.length + (acc.spotBalances?.length ?? 0)} assets{acc.spotBalances?.length ? ` (${acc.spotBalances.length} spot)` : ""} · {acc.positions?.length ?? 0} positions · Last synced {relTime(acc.fetchedAt)}
                            </p>
                            {acc.error && <p className="mt-0.5 text-[10px] text-[#d6b3af]">{acc.error}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-white">{fmtFull(accountTotalUsd(acc))}</p>
                            <p className="text-[10px] text-[#6B6F76]">Available: {fmt(accountAvailableUsd(acc))}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── D. Account Detail Table ── */}
          <div className="rounded-2xl border border-white/10 bg-[#121316] overflow-hidden">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">All Accounts</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#0F1012]">
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-[#6B6F76]">
                    <th className="cursor-pointer px-4 py-2.5 text-left" onClick={() => toggleAccountSort("exchange")}>Exchange <SortArrow active={accountSort.key === "exchange"} dir={accountSort.dir} /></th>
                    <th className="cursor-pointer px-4 py-2.5 text-left" onClick={() => toggleAccountSort("accountName")}>Account <SortArrow active={accountSort.key === "accountName"} dir={accountSort.dir} /></th>
                    <th className="cursor-pointer px-4 py-2.5 text-right" onClick={() => toggleAccountSort("totalValue")}>Total Value <SortArrow active={accountSort.key === "totalValue"} dir={accountSort.dir} /></th>
                    <th className="cursor-pointer px-4 py-2.5 text-right" onClick={() => toggleAccountSort("available")}>Available <SortArrow active={accountSort.key === "available"} dir={accountSort.dir} /></th>
                    <th className="cursor-pointer px-4 py-2.5 text-right" onClick={() => toggleAccountSort("assets")}>Assets <SortArrow active={accountSort.key === "assets"} dir={accountSort.dir} /></th>
                    <th className="cursor-pointer px-4 py-2.5 text-right" onClick={() => toggleAccountSort("positions")}>Positions <SortArrow active={accountSort.key === "positions"} dir={accountSort.dir} /></th>
                    <th className="cursor-pointer px-4 py-2.5 text-center" onClick={() => toggleAccountSort("status")}>Status <SortArrow active={accountSort.key === "status"} dir={accountSort.dir} /></th>
                    <th className="px-4 py-2.5 text-right">Last Sync</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAccounts.map((acc) => {
                    const branding = getExchangeBranding(acc.exchangeId);
                    return (
                      <tr key={`${acc.exchangeId}::${acc.accountName}`} className="border-b border-white/5 text-[#E7E9ED] transition hover:bg-[#17191d]">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <img src={branding.iconUrl} alt="" className="h-5 w-5 rounded-full" loading="lazy" />
                            <span>{acc.exchangeDisplayName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">{acc.accountName}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{fmtFull(accountTotalUsd(acc))}</td>
                        <td className="px-4 py-2.5 text-right">{fmt(accountAvailableUsd(acc))}</td>
                        <td className="px-4 py-2.5 text-right">{acc.balances.length}</td>
                        <td className="px-4 py-2.5 text-right">{acc.positions?.length ?? 0}</td>
                        <td className="px-4 py-2.5 text-center"><StatusBadge status={acc.status} /></td>
                        <td className="px-4 py-2.5 text-right text-[10px] text-[#6B6F76]">{relTime(acc.fetchedAt)}</td>
                      </tr>
                    );
                  })}
                  {sortedAccounts.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-[#6B6F76]">No accounts match filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Spot vs Futures Side by Side ── */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Spot Balances */}
            <div className="rounded-2xl border border-white/10 bg-[#121316] overflow-hidden">
              <div className="border-b border-white/10 px-4 py-2.5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Spot Balances</h2>
                <span className="text-[10px] text-[#6B6F76] font-mono">{fmtFull(accounts.reduce((s, a) => s + (a.spotBalances ?? []).reduce((ss, b) => ss + estimateUsdValue(b.asset, b.total), 0), 0))}</span>
              </div>
              <div className="overflow-y-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#0F1012]">
                    <tr className="border-b border-white/10 text-[9px] uppercase tracking-wide text-[#6B6F76]">
                      <th className="px-3 py-2 text-left">Asset</th>
                      <th className="px-3 py-2 text-left">Exchange</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.flatMap((a) => (a.spotBalances ?? []).filter((b) => b.total > 0).map((b) => ({ ...b, exchange: a.exchangeDisplayName, account: a.accountName }))).sort((a, b) => estimateUsdValue(b.asset, b.total) - estimateUsdValue(a.asset, a.total)).map((b, i) => (
                      <tr key={`spot-${i}`} className="border-b border-white/5 hover:bg-[#17191d]">
                        <td className="px-3 py-2 font-medium text-white">{b.asset}</td>
                        <td className="px-3 py-2 text-[#6B6F76] text-[11px]">{b.exchange} · {b.account}</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px]">{b.total.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px]">{fmtFull(estimateUsdValue(b.asset, b.total))}</td>
                      </tr>
                    ))}
                    {accounts.every((a) => !(a.spotBalances ?? []).some((b) => b.total > 0)) && (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-[#6B6F76] text-xs">No spot balances</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Futures Balances */}
            <div className="rounded-2xl border border-white/10 bg-[#121316] overflow-hidden">
              <div className="border-b border-white/10 px-4 py-2.5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Futures Balances</h2>
                <span className="text-[10px] text-[#6B6F76] font-mono">{fmtFull(accounts.reduce((s, a) => s + a.balances.reduce((ss, b) => ss + estimateUsdValue(b.asset, b.total), 0), 0))}</span>
              </div>
              <div className="overflow-y-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#0F1012]">
                    <tr className="border-b border-white/10 text-[9px] uppercase tracking-wide text-[#6B6F76]">
                      <th className="px-3 py-2 text-left">Asset</th>
                      <th className="px-3 py-2 text-left">Exchange</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.flatMap((a) => a.balances.filter((b) => b.total > 0).map((b) => ({ ...b, exchange: a.exchangeDisplayName, account: a.accountName }))).sort((a, b) => estimateUsdValue(b.asset, b.total) - estimateUsdValue(a.asset, a.total)).map((b, i) => (
                      <tr key={`fut-${i}`} className="border-b border-white/5 hover:bg-[#17191d]">
                        <td className="px-3 py-2 font-medium text-white">{b.asset}</td>
                        <td className="px-3 py-2 text-[#6B6F76] text-[11px]">{b.exchange} · {b.account}</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px]">{b.total.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px]">{fmtFull(estimateUsdValue(b.asset, b.total))}</td>
                      </tr>
                    ))}
                    {accounts.every((a) => !a.balances.some((b) => b.total > 0)) && (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-[#6B6F76] text-xs">No futures balances</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── H. Activity Feed ── */}
          <div className="rounded-2xl border border-white/10 bg-[#121316] p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Recent Activity</h2>
            {activityEvents.length === 0 ? (
              <p className="text-xs text-[#6B6F76]">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {activityEvents.map((evt, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${evt.type === "error" ? "bg-[#d49f9a]" : "bg-[#8fc9ab]"}`} />
                    <span className="text-[#BFC2C7]">{evt.message}</span>
                    <span className="ml-auto text-[#6B6F76]">{relTime(evt.time)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ ASSETS TAB ════ */}
      {activeTab === "assets" && (
        <div className="rounded-2xl border border-white/10 bg-[#121316] overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Asset Holdings</h2>
            <p className="text-[10px] text-[#6B6F76]">Portfolio totals reflect balances from your linked exchange accounts</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#0F1012]">
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-[#6B6F76]">
                  <th className="w-8 px-2 py-2.5" />
                  <th className="cursor-pointer px-4 py-2.5 text-left" onClick={() => toggleAssetSort("asset")}>Asset <SortArrow active={assetSort.key === "asset"} dir={assetSort.dir} /></th>
                  <th className="cursor-pointer px-4 py-2.5 text-right" onClick={() => toggleAssetSort("totalAmount")}>Total Amount <SortArrow active={assetSort.key === "totalAmount"} dir={assetSort.dir} /></th>
                  <th className="cursor-pointer px-4 py-2.5 text-right" onClick={() => toggleAssetSort("usdValue")}>USD Value <SortArrow active={assetSort.key === "usdValue"} dir={assetSort.dir} /></th>
                  <th className="cursor-pointer px-4 py-2.5 text-right" onClick={() => toggleAssetSort("allocation")}>Allocation <SortArrow active={assetSort.key === "allocation"} dir={assetSort.dir} /></th>
                  <th className="px-4 py-2.5 text-left">Exchanges</th>
                  <th className="cursor-pointer px-4 py-2.5 text-right" onClick={() => toggleAssetSort("accountsCount")}>Accounts <SortArrow active={assetSort.key === "accountsCount"} dir={assetSort.dir} /></th>
                </tr>
              </thead>
              <tbody>
                {sortedAssets.map((asset) => {
                  const expanded = expandedAssets.has(asset.asset);
                  const allocationPct = totalValue > 0 ? (asset.usdValue / totalValue) * 100 : 0;
                  return (
                    <Fragment key={asset.asset}>
                      <tr
                        onClick={() => toggleAsset(asset.asset)}
                        className="cursor-pointer border-b border-white/5 text-[#E7E9ED] transition hover:bg-[#17191d]"
                      >
                        <td className="px-2 py-2.5 text-center">
                          <svg className={`h-3 w-3 text-[#6B6F76] transition-transform ${expanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                        </td>
                        <td className="px-4 py-2.5 font-medium">{asset.asset}</td>
                        <td className="px-4 py-2.5 text-right">{fmtNum(asset.totalAmount)}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{fmtFull(asset.usdValue)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(allocationPct, 100)}%` }} />
                            </div>
                            <span className="w-12 text-right text-[10px]">{allocationPct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[#BFC2C7]">{asset.exchanges.join(", ")}</td>
                        <td className="px-4 py-2.5 text-right">{asset.accountsCount}</td>
                      </tr>
                      {expanded && asset.breakdown.map((bd, j) => (
                        <tr key={`${asset.asset}-${j}`} className="border-b border-white/5 bg-[#0B0B0C]/50 text-xs text-[#BFC2C7]">
                          <td />
                          <td className="px-4 py-1.5 pl-8">{bd.exchangeDisplayName} · {bd.accountName}</td>
                          <td className="px-4 py-1.5 text-right">{fmtNum(bd.amount)}</td>
                          <td className="px-4 py-1.5 text-right">{fmtFull(estimateUsdValue(asset.asset, bd.amount))}</td>
                          <td />
                          <td />
                          <td />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                {sortedAssets.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-[#6B6F76]">No assets found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════ POSITIONS TAB ════ */}
      {activeTab === "positions" && (
        <div className="rounded-2xl border border-white/10 bg-[#121316] overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Open Positions</h2>
          </div>
          {allPositions.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-[#6B6F76]">No open positions across connected accounts</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#0F1012]">
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-[#6B6F76]">
                    <th className="px-4 py-2.5 text-left">Exchange</th>
                    <th className="px-4 py-2.5 text-left">Account</th>
                    <th className="px-4 py-2.5 text-left">Symbol</th>
                    <th className="px-4 py-2.5 text-center">Side</th>
                    <th className="px-4 py-2.5 text-right">Size</th>
                    <th className="px-4 py-2.5 text-right">Entry Price</th>
                    <th className="px-4 py-2.5 text-right">Mark Price</th>
                    <th className="px-4 py-2.5 text-right">Unrealized PnL</th>
                    <th className="px-4 py-2.5 text-right">Leverage</th>
                    <th className="px-4 py-2.5 text-right">Liq. Price</th>
                  </tr>
                </thead>
                <tbody>
                  {allPositions.map((pos, i) => {
                    const pnlColor = pos.pnl > 0 ? "text-[#8fc9ab]" : pos.pnl < 0 ? "text-[#d49f9a]" : "text-[#BFC2C7]";
                    const sideColor = pos.side === "BUY" ? "text-[#8fc9ab]" : "text-[#d49f9a]";
                    return (
                      <tr key={`${pos.symbol}-${i}`} className="border-b border-white/5 text-[#E7E9ED] transition hover:bg-[#17191d]">
                        <td className="px-4 py-2.5">{(pos as any).exchangeDisplayName}</td>
                        <td className="px-4 py-2.5">{(pos as any).accountName}</td>
                        <td className="px-4 py-2.5 font-medium">{pos.symbol}</td>
                        <td className={`px-4 py-2.5 text-center font-medium ${sideColor}`}>{pos.side === "BUY" ? "LONG" : "SHORT"}</td>
                        <td className="px-4 py-2.5 text-right">{fmtNum(Math.abs(pos.size))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtNum(pos.entry, 2)}</td>
                        <td className="px-4 py-2.5 text-right">{fmtNum(pos.mark, 2)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${pnlColor}`}>{fmtFull(pos.pnl)}</td>
                        <td className="px-4 py-2.5 text-right">{pos.leverage}x</td>
                        <td className="px-4 py-2.5 text-right text-xs">{pos.liquidation > 0 ? fmtNum(pos.liquidation, 2) : "--"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Footer info ── */}
      <div className="flex items-center justify-between pt-2 text-[10px] text-[#6B6F76]">
        <span>Portfolio totals reflect balances from your linked exchange accounts</span>
        <span>Last synced at {accounts.length > 0 ? new Date(accounts.reduce((latest, a) => (a.fetchedAt > latest ? a.fetchedAt : latest), accounts[0].fetchedAt)).toLocaleString() : "--"}</span>
      </div>
    </div>
  );
}
