import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { AdminAiExchangeManagerPanel } from "../components/AdminAiExchangeManagerPanel";
import { CollapsiblePanel } from "../components/CollapsiblePanel";
import { PaymentReviewPanel } from "../components/PaymentReviewPanel";
import { LogsPanel } from "../components/LogsPanel";
import { BugReportsPanel } from "../components/BugReportsPanel";
import { KillSwitchPanel } from "../components/admin/KillSwitchPanel";
import { TradeTracePanel } from "../components/admin/TradeTracePanel";
import { CircuitBreakerPanel } from "../components/admin/CircuitBreakerPanel";
import { MappingEditor } from "../components/MappingEditor";
import { ProviderFormModal } from "../components/ProviderFormModal";
import { ProviderTable } from "../components/ProviderTable";
import { RefreshSettings } from "../components/RefreshSettings";
import { useAdminConfig } from "../hooks/useAdminConfig";
import type { FieldMapping, ProviderConfig } from "../types";
import {
  createReferralCode,
  createAdminUser,
  deleteReferralCode,
  fetchAdminUsersLite,
  fetchReferralCodes,
  setReferralCodeActive,
  type AdminUserLiteDto,
  type ReferralCodeDto,
} from "../services/adminReferralApi";
import { fetchAdminMembersOverview, type AdminMemberOverviewDto } from "../services/paymentsApi";
import { checkProvidersHealth, type ProviderHealthResult } from "../services/adminProviderHealthApi";

const PANEL_STORAGE_KEY = "adminPanelState";

type PanelKey = "providers" | "mapping" | "refresh" | "tradeIdeas" | "aiProviders" | "aiExchange" | "branding" | "tradingView" | "referrals" | "members" | "adminUsers" | "payments" | "logs" | "bugReports" | "killSwitch" | "tradeTrace" | "circuitBreaker";
type PanelState = Record<PanelKey, boolean>;

const defaultPanelState: PanelState = {
  providers: false,
  mapping: false,
  refresh: false,
  tradeIdeas: false,
  aiProviders: false,
  aiExchange: true,
  branding: false,
  tradingView: false,
  referrals: false,
  members: false,
  adminUsers: false,
  payments: false,
  logs: false,
  bugReports: false,
  killSwitch: false,
  tradeTrace: false,
  circuitBreaker: false,
};

const readPanelState = (): PanelState => {
  try {
    const raw = window.localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) return defaultPanelState;
    const parsed = JSON.parse(raw) as Partial<PanelState>;
    return { ...defaultPanelState, ...parsed };
  } catch {
    return defaultPanelState;
  }
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("File read failed"));
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });

const optimizeImageForStorage = (dataUrl: string, maxSide = 256, quality = 0.85) =>
  new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.width || maxSide;
      const h = img.height || maxSide;
      const ratio = Math.min(1, maxSide / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL("image/webp", quality);
      resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_LOGO_CHARS = 360_000;
const MAX_EMBLEM_CHARS = 210_000;

const optimizeImageToBudget = async (
  dataUrl: string,
  targetChars: number,
  startSide: number,
): Promise<string> => {
  let best = dataUrl;
  const sideCandidates = [startSide, Math.round(startSide * 0.85), Math.round(startSide * 0.7), Math.round(startSide * 0.55)];
  const qualityCandidates = [0.9, 0.84, 0.78, 0.72, 0.66];

  for (const side of sideCandidates) {
    for (const q of qualityCandidates) {
      // Keep aspect ratio and reduce size progressively without stretching.
      const candidate = await optimizeImageForStorage(best, Math.max(96, side), q);
      if (candidate.length < best.length) best = candidate;
      if (best.length <= targetChars) return best;
    }
  }

  return best;
};

export default function AdminPage() {
  const {
    config,
    addProvider,
    setProviders,
    syncProviderPresets,
    updateProvider,
    removeProvider,
    updateMapping,
    setGlobalRefreshSec,
    setFeedToggle,
    setTradeIdeasMinConfidence,
    setTradeIdeasModeMinConfidence,
    setTradeIdeasSharedMode,
    setTradeIdeasFlowDefaults,
    setTradeIdeasDashboardConsensus,
    setTradeIdeasDashboardIdeaRisk,
    setBrandingLogo,
    setBrandingEmblem,
    setTradingViewConfig,
    persistError,
    providersSyncError,
  } = useAdminConfig();
  const [panelState, setPanelState] = useState<PanelState>(() => readPanelState());
  const routerLocation = useLocation();

  // Path-based section filtering: /admin/members → show only members panel
  const pathSegment = routerLocation.pathname.replace("/admin/", "").replace("/admin", "");
  const pathToSection: Record<string, PanelKey> = {
    members: "members",
    users: "adminUsers",
    referrals: "referrals",
    exchanges: "aiExchange",
    "trade-ideas": "tradeIdeas",
    branding: "branding",
    payments: "payments",
    logs: "logs",
    "bug-reports": "bugReports",
    "kill-switch": "killSwitch",
    "trade-trace": "tradeTrace",
    "circuit-breaker": "circuitBreaker",
  };
  const activeSection = (pathToSection[pathSegment] ?? "") as PanelKey | "";

  // Map each hash to which panels should be visible
  const sectionPanels: Record<string, PanelKey[]> = {
    members: ["members"],
    adminUsers: ["adminUsers"],
    referrals: ["referrals"],
    aiExchange: ["aiExchange"],
    tradeIdeas: ["tradeIdeas"],
    branding: ["branding"],
    payments: ["payments"],
    providers: ["providers"],
    mapping: ["mapping"],
    refresh: ["refresh"],
    tradingView: ["tradingView"],
    aiProviders: ["aiProviders"],
    logs: ["logs"],
    bugReports: ["bugReports"],
    killSwitch: ["killSwitch"],
    tradeTrace: ["tradeTrace"],
    circuitBreaker: ["circuitBreaker"],
  };
  const visiblePanels = activeSection && sectionPanels[activeSection]
    ? new Set(sectionPanels[activeSection])
    : null; // null = show all (no hash)

  const shouldShow = (panel: PanelKey) => !visiblePanels || visiblePanels.has(panel);

  // Auto-open the target panel when navigating to a sub-route
  useEffect(() => {
    if (activeSection && activeSection in defaultPanelState) {
      setPanelState((prev) => ({ ...prev, [activeSection]: true }));
    }
  }, [activeSection]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProviderConfig | null>(null);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [showTvSecret, setShowTvSecret] = useState(false);
  const [refUsers, setRefUsers] = useState<AdminUserLiteDto[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUserLiteDto[]>([]);
  const [refCodes, setRefCodes] = useState<ReferralCodeDto[]>([]);
  const [refBusy, setRefBusy] = useState(false);
  const [refErr, setRefErr] = useState<string | null>(null);
  const [refForm, setRefForm] = useState({
    assignedUserId: "",
    assignedEmail: "",
    prefix: "BITRIUM",
    maxUses: 1,
    expiresDays: 30,
  });
  const [membersBusy, setMembersBusy] = useState(false);
  const [membersErr, setMembersErr] = useState<string | null>(null);
  const [memberTotals, setMemberTotals] = useState({ users: 0, activeUsers: 0, totalPaidUsdt: 0, avgPaidUsdt: 0 });
  const [memberRows, setMemberRows] = useState<AdminMemberOverviewDto[]>([]);
  const [adminUserForm, setAdminUserForm] = useState({
    email: "",
    password: "",
    role: "ADMIN" as "ADMIN" | "USER",
  });
  const [adminUserBusy, setAdminUserBusy] = useState(false);
  const [adminUserErr, setAdminUserErr] = useState<string | null>(null);
  const [providerHealthBusy, setProviderHealthBusy] = useState(false);
  const [providerHealthError, setProviderHealthError] = useState<string | null>(null);
  const [providerHealthSummary, setProviderHealthSummary] = useState<{
    total: number;
    ok: number;
    warn: number;
    fail: number;
    skip: number;
  } | null>(null);
  const providerOptions = useMemo(() => config.providers.filter((provider) => provider.enabled), [config.providers]);
  const isFallbackCandidate = (provider: ProviderConfig) =>
    (provider.providerGroup === "EXCHANGE" ||
      provider.name.toLowerCase().includes("bitrium labs") ||
      provider.name.toLowerCase().includes("bitrium labs")) &&
    (provider.fallbackPriority ?? 0) > 0;
  const sourceFallbackRows = useMemo(
    () =>
      config.providers
        .filter((provider) => isFallbackCandidate(provider))
        .sort((a, b) => (a.fallbackPriority ?? Number.MAX_SAFE_INTEGER) - (b.fallbackPriority ?? Number.MAX_SAFE_INTEGER)),
    [config.providers],
  );
  const orderedFallbackIds = useMemo(() => sourceFallbackRows.map((row) => row.id), [sourceFallbackRows]);

  const applyFallbackOrder = (orderedIds: string[]) => {
    if (!orderedIds.length) return;
    const nextRankById = new Map(orderedIds.map((id, idx) => [id, idx + 1] as const));
    const defaultId = orderedIds[0] ?? null;
    const nextProviders = config.providers.map((provider) => {
      if (!isFallbackCandidate(provider)) return provider;
      const nextRank = nextRankById.get(provider.id);
      if (!nextRank) return provider;
      return {
        ...provider,
        fallbackPriority: nextRank,
        defaultPrimary: provider.id === defaultId,
      };
    });
    setProviders(nextProviders);
  };

  const moveFallbackPriority = (providerId: string, direction: "up" | "down") => {
    if (!sourceFallbackRows.length) return;
    const orderedIds = sourceFallbackRows.map((row) => row.id);
    const idx = orderedIds.findIndex((id) => id === providerId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= orderedIds.length) return;
    const nextOrder = orderedIds.slice();
    const [moved] = nextOrder.splice(idx, 1);
    nextOrder.splice(swapIdx, 0, moved);
    applyFallbackOrder(nextOrder);
  };

  const pinFallbackTop = (providerId: string) => {
    if (!sourceFallbackRows.length) return;
    const orderedIds = sourceFallbackRows.map((row) => row.id);
    const idx = orderedIds.findIndex((id) => id === providerId);
    if (idx <= 0) return;
    const nextOrder = orderedIds.slice();
    const [moved] = nextOrder.splice(idx, 1);
    nextOrder.unshift(moved);
    applyFallbackOrder(nextOrder);
  };

  const applyProviderHealth = (items: ProviderHealthResult[]) => {
    const byId = new Map(items.map((item) => [item.id, item] as const));
    const next = config.providers.map((provider) => {
      const result = byId.get(provider.id);
      if (!result) return provider;
      const nextStatus: ProviderConfig["lastTestStatus"] =
        result.status === "OK" ? "OK" : result.status === "SKIP" ? "UNKNOWN" : "FAIL";
      const nextNotes =
        result.status === "OK"
          ? provider.notes
          : `${provider.notes ? `${provider.notes} | ` : ""}Health: ${result.detail}`;
      return {
        ...provider,
        lastTestStatus: nextStatus,
        lastTestAt: new Date().toISOString(),
        notes: nextNotes,
      };
    });
    setProviders(next);
  };

  const runProviderHealthCheck = async (targetProviders?: ProviderConfig[]) => {
    const list = (targetProviders ?? config.providers).filter((provider) => provider.enabled);
    if (!list.length) {
      setProviderHealthSummary({ total: 0, ok: 0, warn: 0, fail: 0, skip: 0 });
      return;
    }
    setProviderHealthBusy(true);
    setProviderHealthError(null);
    try {
      const result = await checkProvidersHealth(list);
      setProviderHealthSummary(result.summary);
      applyProviderHealth(result.items);
    } catch (error) {
      setProviderHealthError(error instanceof Error ? error.message : "provider_health_check_failed");
    } finally {
      setProviderHealthBusy(false);
    }
  };

  useEffect(() => {
    if (!panelState.providers) return;
    void runProviderHealthCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelState.providers]);

  const togglePanel = (key: PanelKey) => {
    setPanelState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const onMappingChange = (fieldKey: string, patch: Partial<FieldMapping>) => {
    if (patch.refreshSec !== undefined && (!Number.isFinite(patch.refreshSec) || patch.refreshSec <= 0)) {
      setValidationMsg("Refresh interval must be numeric and greater than 0.");
      return;
    }
    setValidationMsg(null);
    updateMapping(fieldKey, patch);
  };

  const reloadReferrals = async () => {
    setRefBusy(true);
    setRefErr(null);
    try {
      const [usersRes, codesRes] = await Promise.all([fetchAdminUsersLite(), fetchReferralCodes()]);
      setAllUsers(usersRes.users);
      setRefUsers(usersRes.users.filter((user) => user.role !== "ADMIN"));
      setRefCodes(codesRes.items);
    } catch (e: any) {
      setRefErr(e?.message ?? "Failed to load referral codes");
    } finally {
      setRefBusy(false);
    }
  };

  useEffect(() => {
    void reloadReferrals();
  }, []);

  const reloadMembers = async () => {
    setMembersBusy(true);
    setMembersErr(null);
    try {
      const { getAuthToken } = await import("../services/authClient");
      const token = getAuthToken();
      if (!token) { setMembersErr("Not authenticated. Please re-login."); setMembersBusy(false); return; }
      const res = await fetchAdminMembersOverview();
      setMemberTotals(res.totals);
      setMemberRows(res.members);
    } catch (e: any) {
      setMembersErr(e?.message ?? "Failed to load members overview");
    } finally {
      setMembersBusy(false);
    }
  };

  useEffect(() => {
    void reloadMembers();
  }, []);

  const adminUsers = useMemo(() => allUsers.filter((u) => u.role === "ADMIN"), [allUsers]);

  // Section titles for sub-page headers
  const sectionTitles: Record<string, { title: string; desc: string }> = {
    members: { title: "Members", desc: "Total members, membership duration and total paid amounts" },
    adminUsers: { title: "Admin Users", desc: "Create admin accounts from a dedicated panel" },
    referrals: { title: "Referral Codes", desc: "Generate and manage referral codes for members" },
    aiExchange: { title: "Exchange Manager", desc: "Connect / update / remove exchange APIs" },
    tradeIdeas: { title: "Trade Ideas Settings", desc: "Confidence threshold used by the feed" },
    branding: { title: "Branding", desc: "Sidebar logo and collapsed emblem upload" },
    payments: { title: "Payment Review", desc: "Monitor invoices, pending payments, and manual confirmations" },
    logs: { title: "Logs", desc: "System event logs, error tracking, and operational monitoring" },
    bugReports: { title: "Bug Reports", desc: "Track and manage bug reports from users and internal team" },
    providers: { title: "API Sources", desc: "Manage API keys/endpoints from admin" },
    mapping: { title: "Field Mapping", desc: "Map required market fields to provider endpoints" },
    refresh: { title: "Refresh Settings", desc: "Global refresh and per-feed switches" },
    tradingView: { title: "TradingView API", desc: "Configure TradingView credentials and fallback widget defaults" },
  };
  const headerInfo = activeSection && sectionTitles[activeSection]
    ? sectionTitles[activeSection]
    : { title: "Admin Dashboard", desc: "Platform administration and configuration" };

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <h1 className="text-lg font-semibold text-white">{headerInfo.title}</h1>
          <p className="text-xs text-[#6B6F76]">{headerInfo.desc}</p>
        </section>

        {shouldShow("members") && (
        <CollapsiblePanel
          title="Members Overview"
          description="Total members, membership duration and total paid amounts"
          open={panelState.members}
          onToggle={() => togglePanel("members")}
          status={`${memberTotals.users} members`}
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[#6B6F76]">Total Members</p>
                <p className="mt-1 text-2xl font-semibold text-white">{memberTotals.users}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[#6B6F76]">Active Members</p>
                <p className="mt-1 text-2xl font-semibold text-[#9BE7B6]">{memberTotals.activeUsers}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[#6B6F76]">Total Revenue</p>
                <p className="mt-1 text-2xl font-semibold text-[#F5C542]">{memberTotals.totalPaidUsdt.toLocaleString()} USDT</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[#6B6F76]">Avg Revenue / Member</p>
                <p className="mt-1 text-2xl font-semibold text-white">{memberTotals.avgPaidUsdt.toLocaleString()} USDT</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Member List</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search email..."
                    className="rounded-lg border border-white/10 bg-[#121316] px-3 py-1.5 text-xs text-white outline-none placeholder:text-[#6B6F76] focus:border-[#F5C542]/50 w-48"
                    onChange={(e) => {
                      const q = e.target.value.toLowerCase();
                      if (!q) { void reloadMembers(); return; }
                      setMemberRows((prev) => prev.filter((r) => r.email.toLowerCase().includes(q)));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void reloadMembers()}
                    disabled={membersBusy}
                    className="rounded-lg border border-white/15 bg-[#121316] px-3 py-1.5 text-xs text-[#BFC2C7] hover:text-white disabled:opacity-50"
                  >
                    {membersBusy ? "Loading..." : "Refresh"}
                  </button>
                </div>
              </div>
              <div className="max-h-[360px] overflow-auto rounded-lg border border-white/10">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#13151a] text-[#8e94a0]">
                    <tr>
                      <th className="px-2 py-2 font-medium">Email</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Plan</th>
                      <th className="px-2 py-2 font-medium">Months</th>
                      <th className="px-2 py-2 font-medium">Days Left</th>
                      <th className="px-2 py-2 font-medium">Total Paid (USDT)</th>
                      <th className="px-2 py-2 font-medium">Subscriptions</th>
                      <th className="px-2 py-2 font-medium">Member Since</th>
                      <th className="px-2 py-2 font-medium text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberRows.map((row) => (
                      <tr key={row.userId} className="border-t border-white/5 text-[#d7dae0]">
                        <td className="px-2 py-2">{row.email}</td>
                        <td className="px-2 py-2">
                          <span className={`rounded px-2 py-0.5 ${row.membershipStatus === "ACTIVE" ? "bg-[#1b2a1f] text-[#8de2a8]" : "bg-[#2a1c1c] text-[#e0a5a5]"}`}>
                            {row.membershipStatus}
                          </span>
                        </td>
                        <td className="px-2 py-2">{row.activePlanName}</td>
                        <td className="px-2 py-2">{row.purchasedMonths}</td>
                        <td className="px-2 py-2">{row.daysRemaining}</td>
                        <td className="px-2 py-2">{row.totalPaidUsdt.toLocaleString()}</td>
                        <td className="px-2 py-2">{row.subscriptionsCount}</td>
                        <td className="px-2 py-2">{new Date(row.createdAt).toLocaleDateString()}</td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            title="Delete user"
                            onClick={async () => {
                              if (!confirm(`Delete user ${row.email}? This cannot be undone.`)) return;
                              try {
                                const { getAuthToken } = await import("../services/authClient");
                                await fetch(`/api/admin/users/${row.userId}`, {
                                  method: "DELETE",
                                  headers: { Authorization: `Bearer ${getAuthToken()}` },
                                });
                                void reloadMembers();
                              } catch { alert("Delete failed"); }
                            }}
                            className="rounded p-1 text-[#e0a5a5] transition hover:bg-[#2a1c1c] hover:text-red-400"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!membersBusy && !memberRows.length ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-[#6B6F76]">
                          No members found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {membersErr ? (
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-xs text-[#d6b3af]">{membersErr}</p>
                  <button type="button" onClick={() => void reloadMembers()} className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-[#BFC2C7] hover:text-white">Retry</button>
                </div>
              ) : null}
            </div>
          </div>
        </CollapsiblePanel>
        )}

        {shouldShow("providers") && (
        <CollapsiblePanel
          title="Outsource APIs & Exchange Sources"
          description="Manage API keys/endpoints from admin (add/edit/delete/test)"
          open={panelState.providers}
          onToggle={() => togglePanel("providers")}
          status={`${config.providers.length} configured`}
        >
          <section className="mb-3 rounded-xl border border-white/10 bg-[#0F1012] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white">Live Provider Data Check</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={syncProviderPresets}
                  className="rounded-lg border border-[#F5C542]/60 bg-[#2b2417] px-3 py-1.5 text-xs font-semibold text-[#F5C542]"
                >
                  Sync Requested Presets
                </button>
                <button
                  type="button"
                  disabled={providerHealthBusy}
                  onClick={() => void runProviderHealthCheck()}
                  className="rounded-lg border border-white/15 bg-[#121316] px-3 py-1.5 text-xs text-[#BFC2C7] disabled:opacity-60"
                >
                  {providerHealthBusy ? "Checking..." : "Check Live Data"}
                </button>
              </div>
            </div>
            {providerHealthSummary ? (
              <p className="mt-1 text-[11px] text-[#8d94a2]">
                Total {providerHealthSummary.total} · OK {providerHealthSummary.ok} · Warn {providerHealthSummary.warn} · Fail {providerHealthSummary.fail} · Skip {providerHealthSummary.skip}
              </p>
            ) : null}
            {providerHealthError ? (
              <p className="mt-2 rounded-lg border border-[#704844] bg-[#271a19] px-2 py-1 text-[11px] text-[#efb5b5]">
                Provider health check failed: {providerHealthError}
              </p>
            ) : null}
            {providerHealthSummary && (providerHealthSummary.fail > 0 || providerHealthSummary.warn > 0) ? (
              <p className="mt-2 rounded-lg border border-[#704844] bg-[#271a19] px-2 py-1 text-[11px] text-[#efb5b5]">
                Warning: Some API sources are not returning live data. Fix keys/endpoints from this panel.
              </p>
            ) : null}
          </section>

          {sourceFallbackRows.length ? (
            <section className="mb-3 rounded-xl border border-white/10 bg-[#0F1012] p-3">
              <p className="text-xs font-semibold text-white">Exchange Source Order</p>
              <p className="mt-1 text-[11px] text-[#8d94a2]">
                Top row is default source. System fallback follows this order unless user selects a different source.
              </p>
            </section>
          ) : null}

          <ProviderTable
            providers={config.providers}
            orderedPriorityIds={orderedFallbackIds}
            onAdd={() => {
              setEditingProvider(null);
              setModalOpen(true);
            }}
            onEdit={(provider) => {
              setEditingProvider(provider);
              setModalOpen(true);
            }}
            onDelete={(provider) => setDeleteTarget(provider)}
            onToggleEnabled={(provider) => updateProvider({ ...provider, enabled: !provider.enabled })}
            onTestConnection={(provider) => void runProviderHealthCheck([provider])}
            onMovePriority={(providerId, direction) => moveFallbackPriority(providerId, direction)}
            onPinPriorityTop={(providerId) => pinFallbackTop(providerId)}
          />
        </CollapsiblePanel>
        )}

        {shouldShow("adminUsers") && (
        <CollapsiblePanel
          title="Admin Users"
          description="Create admin accounts from a dedicated panel"
          open={panelState.adminUsers}
          onToggle={() => togglePanel("adminUsers")}
          status={`${adminUsers.length} admins`}
        >
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <section className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
              <h3 className="text-sm font-semibold text-white">Create User</h3>
              <div className="mt-3 space-y-2">
                <label className="text-xs text-[#BFC2C7]">
                  Email
                  <input
                    type="email"
                    value={adminUserForm.email}
                    onChange={(e) => setAdminUserForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="new-admin@bitrium.local"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
                  />
                </label>
                <label className="text-xs text-[#BFC2C7]">
                  Password
                  <input
                    type="password"
                    value={adminUserForm.password}
                    onChange={(e) => setAdminUserForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Min 8 chars"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
                  />
                </label>
                <label className="text-xs text-[#BFC2C7]">
                  Role
                  <select
                    value={adminUserForm.role}
                    onChange={(e) => setAdminUserForm((prev) => ({ ...prev, role: e.target.value as "ADMIN" | "USER" }))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="USER">USER</option>
                  </select>
                </label>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={adminUserBusy}
                    onClick={async () => {
                      setAdminUserBusy(true);
                      setAdminUserErr(null);
                      try {
                        await createAdminUser({
                          email: adminUserForm.email.trim(),
                          password: adminUserForm.password,
                          role: adminUserForm.role,
                        });
                        setAdminUserForm({ email: "", password: "", role: "ADMIN" });
                        await reloadReferrals();
                      } catch (e: any) {
                        setAdminUserErr(e?.message ?? "Failed to create user");
                      } finally {
                        setAdminUserBusy(false);
                      }
                    }}
                    className="rounded-lg border border-[#F5C542]/50 bg-[#2a2315] px-3 py-2 text-xs font-semibold text-[#F5C542] disabled:opacity-60"
                  >
                    Create User
                  </button>
                  <button
                    type="button"
                    disabled={adminUserBusy}
                    onClick={() => void reloadReferrals()}
                    className="rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-xs text-[#BFC2C7] disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>
                {adminUserErr ? <p className="text-xs text-[#d6b3af]">{adminUserErr}</p> : null}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
              <h3 className="text-sm font-semibold text-white">Current Admin Accounts</h3>
              <div className="mt-2 max-h-[300px] overflow-auto rounded-lg border border-white/10">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#13151a] text-[#8e94a0]">
                    <tr>
                      <th className="px-2 py-2 font-medium">Email</th>
                      <th className="px-2 py-2 font-medium">Role</th>
                      <th className="px-2 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((user) => (
                      <tr key={user.id} className="border-t border-white/5 text-[#d7dae0]">
                        <td className="px-2 py-2">{user.email}</td>
                        <td className="px-2 py-2">{user.role}</td>
                        <td className="px-2 py-2">{new Date(user.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                    {!adminUsers.length ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-[#6B6F76]">
                          No admin users found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </CollapsiblePanel>
        )}

        {shouldShow("mapping") && (
        <CollapsiblePanel
          title="Feature / Field Mapping"
          description="Map required market fields to provider endpoints"
          open={panelState.mapping}
          onToggle={() => togglePanel("mapping")}
        >
          <MappingEditor mappings={config.mappings} providers={providerOptions} onChange={onMappingChange} />
        </CollapsiblePanel>
        )}

        {shouldShow("refresh") && (
        <CollapsiblePanel
          title="Refresh Settings"
          description="Global refresh and per-feed switches"
          open={panelState.refresh}
          onToggle={() => togglePanel("refresh")}
        >
          <div className="space-y-3">
            <RefreshSettings
              globalRefreshSec={config.globalRefreshSec}
              feeds={config.feeds}
              onChangeGlobalRefresh={(value) => {
                if (!Number.isFinite(value) || value <= 0) {
                  setValidationMsg("Global refresh interval must be numeric and greater than 0.");
                  return;
                }
                setValidationMsg(null);
                setGlobalRefreshSec(value);
              }}
              onChangeFeed={(key, value) => {
                setFeedToggle(key, value);
              }}
            />
            <section className="rounded-xl border border-white/10 bg-[#0F1012] p-3 text-xs">
              <p className="font-semibold text-white">Security / Display</p>
              <p className="mt-1 text-[#6B6F76]">Secrets are stored locally (dev mode). Use temporary “Show” in providers to reveal masked values.</p>
            </section>
          </div>
        </CollapsiblePanel>
        )}

        {shouldShow("tradeIdeas") && (
        <CollapsiblePanel
          title="Trade Ideas Settings"
          description="Confidence threshold used by the feed"
          open={panelState.tradeIdeas}
          onToggle={() => togglePanel("tradeIdeas")}
          status={`Min ${config.tradeIdeas.minConfidence.toFixed(2)}`}
        >
          <div className="grid gap-3 md:grid-cols-[1fr_130px]">
            <label className="text-xs text-[#BFC2C7]">
              Confidence Threshold ({config.tradeIdeas.minConfidence.toFixed(2)})
              <input
                type="range"
                min={0.5}
                max={0.95}
                step={0.01}
                value={config.tradeIdeas.minConfidence}
                onChange={(e) => setTradeIdeasMinConfidence(Number(e.target.value))}
                className="mt-2 w-full accent-[#F5C542]"
              />
            </label>
            <label className="text-xs text-[#BFC2C7]">
              Min Confidence
              <input
                type="number"
                min={0.5}
                max={0.95}
                step={0.01}
                value={config.tradeIdeas.minConfidence}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  setTradeIdeasMinConfidence(Math.max(0.5, Math.min(0.95, v)));
                }}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none focus:border-[#F5C542]/50"
              />
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="text-xs text-[#BFC2C7]">
              Flow Min
              <input
                type="number"
                min={0.5}
                max={0.95}
                step={0.01}
                value={config.tradeIdeas.modeMinConfidence.FLOW}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  setTradeIdeasModeMinConfidence("FLOW", v);
                }}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              />
            </label>
            <label className="text-xs text-[#BFC2C7]">
              Aggressive Min
              <input
                type="number"
                min={0.5}
                max={0.95}
                step={0.01}
                value={config.tradeIdeas.modeMinConfidence.AGGRESSIVE}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  setTradeIdeasModeMinConfidence("AGGRESSIVE", v);
                }}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              />
            </label>
            <label className="text-xs text-[#BFC2C7]">
              Balanced Min
              <input
                type="number"
                min={0.5}
                max={0.95}
                step={0.01}
                value={config.tradeIdeas.modeMinConfidence.BALANCED}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  setTradeIdeasModeMinConfidence("BALANCED", v);
                }}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              />
            </label>
            <label className="text-xs text-[#BFC2C7]">
              Capital Guard Min
              <input
                type="number"
                min={0.5}
                max={0.95}
                step={0.01}
                value={config.tradeIdeas.modeMinConfidence.CAPITAL_GUARD}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  setTradeIdeasModeMinConfidence("CAPITAL_GUARD", v);
                }}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              />
            </label>
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-[#0F1012] p-3">
            <p className="text-sm font-semibold text-white">Shared System Mode (Admin)</p>
            <p className="mt-1 text-xs text-[#6B6F76]">
              Aggressive, Balanced, Capital Guard are global modes controlled by Admin for all users.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(
                [
                  { key: "AGGRESSIVE", label: "Aggressive" },
                  { key: "BALANCED", label: "Balanced" },
                  { key: "CAPITAL_GUARD", label: "Capital Guard" },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTradeIdeasSharedMode(item.key)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    config.tradeIdeas.sharedMode === item.key
                      ? "border-[#F5C542]/70 bg-[#2a2418] text-[#F5C542]"
                      : "border-white/15 bg-[#0F1012] text-[#BFC2C7]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-[#6a5fc8]/35 bg-[#171629] p-3">
            <p className="text-sm font-semibold text-white">Flow Mode Defaults (User Base)</p>
            <p className="mt-1 text-xs text-[#aab0bc]">
              These values are the default Flow profile for every user. Users can override Flow settings personally.
              Aggressive, Balanced, and Capital Guard remain admin-governed shared modes.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-xs text-[#BFC2C7]">
                Flow Min Consensus (%)
                <input
                  type="number"
                  min={20}
                  max={95}
                  step={1}
                  value={config.tradeIdeas.flowDefaults.minConsensus}
                  onChange={(e) =>
                    setTradeIdeasFlowDefaults({
                      minConsensus: Math.max(20, Math.min(95, Number(e.target.value) || 70)),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
                />
              </label>
              <label className="text-xs text-[#BFC2C7]">
                Flow Min Valid Bars
                <input
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  value={config.tradeIdeas.flowDefaults.minValidBars}
                  onChange={(e) =>
                    setTradeIdeasFlowDefaults({
                      minValidBars: Math.max(1, Math.min(12, Math.round(Number(e.target.value) || 4))),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
                />
              </label>
              <label className="text-xs text-[#BFC2C7]">
                Flow Require VALID
                <button
                  type="button"
                  onClick={() =>
                    setTradeIdeasFlowDefaults({
                      requireValidTrade: !config.tradeIdeas.flowDefaults.requireValidTrade,
                    })
                  }
                  className={`mt-1 inline-flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold ${
                    config.tradeIdeas.flowDefaults.requireValidTrade
                      ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"
                      : "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]"
                  }`}
                >
                  <span>{config.tradeIdeas.flowDefaults.requireValidTrade ? "Require VALID" : "Allow WEAK"}</span>
                  <span>{config.tradeIdeas.flowDefaults.requireValidTrade ? "ON" : "OFF"}</span>
                </button>
              </label>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-xs text-[#BFC2C7]">
              Active Min (70-79 tier start)
              <input
                type="number"
                min={50}
                max={95}
                step={1}
                value={config.tradeIdeas.dashboardConsensus.activeMin}
                onChange={(e) =>
                  setTradeIdeasDashboardConsensus({
                    activeMin: Math.max(50, Math.min(95, Number(e.target.value) || 70)),
                  })
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              />
            </label>
            <label className="text-xs text-[#BFC2C7]">
              Strong Min (80-89 tier start)
              <input
                type="number"
                min={50}
                max={99}
                step={1}
                value={config.tradeIdeas.dashboardConsensus.strongMin}
                onChange={(e) =>
                  setTradeIdeasDashboardConsensus({
                    strongMin: Math.max(50, Math.min(99, Number(e.target.value) || 80)),
                  })
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              />
            </label>
            <label className="text-xs text-[#BFC2C7]">
              Elite Min (90-100 tier start)
              <input
                type="number"
                min={50}
                max={100}
                step={1}
                value={config.tradeIdeas.dashboardConsensus.eliteMin}
                onChange={(e) =>
                  setTradeIdeasDashboardConsensus({
                    eliteMin: Math.max(50, Math.min(100, Number(e.target.value) || 90)),
                  })
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              />
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="text-xs text-[#BFC2C7]">
              Entry ATR Factor
              <input
                type="number"
                min={0.1}
                max={2}
                step={0.01}
                value={config.tradeIdeas.dashboardIdeaRisk.entryAtrFactor}
                onChange={(e) =>
                  setTradeIdeasDashboardIdeaRisk({
                    entryAtrFactor: Math.max(0.1, Math.min(2, Number(e.target.value) || 0.35)),
                  })
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              />
            </label>
            <label className="text-xs text-[#BFC2C7]">
              Stop ATR Factor
              <input
                type="number"
                min={0.1}
                max={3}
                step={0.01}
                value={config.tradeIdeas.dashboardIdeaRisk.stopAtrFactor}
                onChange={(e) =>
                  setTradeIdeasDashboardIdeaRisk({
                    stopAtrFactor: Math.max(0.1, Math.min(3, Number(e.target.value) || 0.75)),
                  })
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              />
            </label>
            <label className="text-xs text-[#BFC2C7]">
              TP1 ATR Factor
              <input
                type="number"
                min={0.1}
                max={4}
                step={0.01}
                value={config.tradeIdeas.dashboardIdeaRisk.targetAtrFactor}
                onChange={(e) =>
                  setTradeIdeasDashboardIdeaRisk({
                    targetAtrFactor: Math.max(0.1, Math.min(4, Number(e.target.value) || 1.15)),
                  })
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              />
            </label>
            <label className="text-xs text-[#BFC2C7]">
              TP2 Multiplier
              <input
                type="number"
                min={1}
                max={3}
                step={0.01}
                value={config.tradeIdeas.dashboardIdeaRisk.target2Multiplier}
                onChange={(e) =>
                  setTradeIdeasDashboardIdeaRisk({
                    target2Multiplier: Math.max(1, Math.min(3, Number(e.target.value) || 1.65)),
                  })
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              />
            </label>
          </div>
        </CollapsiblePanel>
        )}

        {shouldShow("referrals") && (
        <CollapsiblePanel
          title="Member Referral Codes"
          description="Generate and manage referral codes for members"
          open={panelState.referrals}
          onToggle={() => togglePanel("referrals")}
          status={`${refCodes.length} codes`}
        >
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <section className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
              <h3 className="text-sm font-semibold text-white">Generate Code</h3>
              <div className="mt-3 space-y-2">
                <label className="text-xs text-[#BFC2C7]">
                  Member
                  <select
                    value={refForm.assignedUserId}
                    onChange={(e) => setRefForm((prev) => ({ ...prev, assignedUserId: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
                  >
                    <option value="">Any member</option>
                    {refUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[#BFC2C7]">
                  Target Email (optional)
                  <input
                    value={refForm.assignedEmail}
                    onChange={(e) => setRefForm((prev) => ({ ...prev, assignedEmail: e.target.value }))}
                    placeholder="member@email.com"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs text-[#BFC2C7]">
                    Prefix
                    <input
                      value={refForm.prefix}
                      onChange={(e) => setRefForm((prev) => ({ ...prev, prefix: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-2 py-2 text-sm text-[#E7E9ED] outline-none"
                    />
                  </label>
                  <label className="text-xs text-[#BFC2C7]">
                    Max Uses
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      value={refForm.maxUses}
                      onChange={(e) => setRefForm((prev) => ({ ...prev, maxUses: Math.max(1, Number(e.target.value) || 1) }))}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-2 py-2 text-sm text-[#E7E9ED] outline-none"
                    />
                  </label>
                  <label className="text-xs text-[#BFC2C7]">
                    Expires (days)
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={refForm.expiresDays}
                      onChange={(e) => setRefForm((prev) => ({ ...prev, expiresDays: Math.max(1, Number(e.target.value) || 30) }))}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-2 py-2 text-sm text-[#E7E9ED] outline-none"
                    />
                  </label>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={refBusy}
                    onClick={async () => {
                      setRefBusy(true);
                      setRefErr(null);
                      try {
                        await createReferralCode({
                          assignedUserId: refForm.assignedUserId || undefined,
                          assignedEmail: refForm.assignedEmail.trim() || undefined,
                          prefix: refForm.prefix.trim() || undefined,
                          maxUses: refForm.maxUses,
                          expiresDays: refForm.expiresDays,
                        });
                        await reloadReferrals();
                      } catch (e: any) {
                        setRefErr(e?.message ?? "Failed to create referral code");
                        setRefBusy(false);
                      }
                    }}
                    className="rounded-lg border border-[#F5C542]/50 bg-[#2a2315] px-3 py-2 text-xs font-semibold text-[#F5C542] disabled:opacity-60"
                  >
                    Generate
                  </button>
                  <button
                    type="button"
                    disabled={refBusy}
                    onClick={() => void reloadReferrals()}
                    className="rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-xs text-[#BFC2C7] disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>
                {refErr ? <p className="text-xs text-[#d6b3af]">{refErr}</p> : null}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
              <h3 className="text-sm font-semibold text-white">Generated Codes</h3>
              <div className="mt-2 max-h-[360px] overflow-auto rounded-lg border border-white/10">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#13151a] text-[#8e94a0]">
                    <tr>
                      <th className="px-2 py-2 font-medium">Code</th>
                      <th className="px-2 py-2 font-medium">Member</th>
                      <th className="px-2 py-2 font-medium">Uses</th>
                      <th className="px-2 py-2 font-medium">Expires</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refCodes.map((row) => {
                      const member = refUsers.find((u) => u.id === row.assignedUserId)?.email ?? row.assignedEmail ?? "Any";
                      const expired = row.expiresAt ? Date.parse(row.expiresAt) < Date.now() : false;
                      const status = !row.active ? "DISABLED" : expired ? "EXPIRED" : "ACTIVE";
                      return (
                        <tr key={row.id} className="border-t border-white/5 text-[#d7dae0]">
                          <td className="px-2 py-2 font-semibold text-[#F5C542]">{row.code}</td>
                          <td className="px-2 py-2">{member}</td>
                          <td className="px-2 py-2">{row.usedCount}/{row.maxUses}</td>
                          <td className="px-2 py-2">{row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : "-"}</td>
                          <td className="px-2 py-2">
                            <span className={`rounded px-2 py-0.5 ${status === "ACTIVE" ? "bg-[#1b2a1f] text-[#8de2a8]" : "bg-[#2a1c1c] text-[#e0a5a5]"}`}>
                              {status}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                className="rounded border border-white/15 bg-[#11131a] px-2 py-1 text-[11px] text-[#BFC2C7]"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(row.code);
                                  } catch {
                                    setRefErr("Clipboard not available");
                                  }
                                }}
                              >
                                Copy
                              </button>
                              <button
                                type="button"
                                className="rounded border border-white/15 bg-[#11131a] px-2 py-1 text-[11px] text-[#BFC2C7]"
                                onClick={async () => {
                                  await setReferralCodeActive(row.id, !row.active);
                                  await reloadReferrals();
                                }}
                              >
                                {row.active ? "Disable" : "Enable"}
                              </button>
                              <button
                                type="button"
                                className="rounded border border-[#704844] bg-[#271a19] px-2 py-1 text-[11px] text-[#d6b3af]"
                                onClick={async () => {
                                  await deleteReferralCode(row.id);
                                  await reloadReferrals();
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!refCodes.length ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-[#6B6F76]">
                          No referral codes generated yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </CollapsiblePanel>
        )}

        {shouldShow("aiExchange") && (
        <CollapsiblePanel
          title="Exchange Manager"
          description="Connect / update / remove exchange APIs"
          open={panelState.aiExchange}
          onToggle={() => togglePanel("aiExchange")}
        >
          <AdminAiExchangeManagerPanel />
        </CollapsiblePanel>
        )}

        {shouldShow("tradingView") && (
        <CollapsiblePanel
          title="TradingView API"
          description="Configure TradingView credentials and fallback widget defaults"
          open={panelState.tradingView}
          onToggle={() => togglePanel("tradingView")}
          status={config.tradingView.enabled ? "ENABLED" : "DISABLED"}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-xs text-[#BFC2C7]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#F5C542]"
                checked={config.tradingView.enabled}
                onChange={(e) => setTradingViewConfig({ enabled: e.target.checked })}
              />
              Enable TradingView API
            </label>
            <label className="text-xs text-[#BFC2C7]">
              Default Exchange
              <select
                value={config.tradingView.defaultExchange ?? "BINANCE"}
                onChange={(e) => setTradingViewConfig({ defaultExchange: e.target.value as "BINANCE" | "BYBIT" | "OKX" | "GATEIO" })}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none"
              >
                <option value="BINANCE">BINANCE</option>
                <option value="BYBIT">BYBIT</option>
                <option value="OKX">OKX</option>
                <option value="GATEIO">GATEIO</option>
              </select>
            </label>

            <label className="text-xs text-[#BFC2C7]">
              TradingView API Key
              <input
                value={config.tradingView.apiKey ?? ""}
                onChange={(e) => setTradingViewConfig({ apiKey: e.target.value })}
                placeholder="tv_api_key..."
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none focus:border-[#F5C542]/50"
              />
            </label>
            <label className="text-xs text-[#BFC2C7]">
              TradingView API Secret
              <div className="mt-1 flex gap-2">
                <input
                  type={showTvSecret ? "text" : "password"}
                  value={config.tradingView.apiSecret ?? ""}
                  onChange={(e) => setTradingViewConfig({ apiSecret: e.target.value })}
                  placeholder="tv_api_secret..."
                  className="w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none focus:border-[#F5C542]/50"
                />
                <button
                  type="button"
                  onClick={() => setShowTvSecret((v) => !v)}
                  className="rounded-lg border border-white/15 bg-[#121316] px-3 py-2 text-xs text-[#BFC2C7]"
                >
                  {showTvSecret ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <label className="text-xs text-[#BFC2C7] md:col-span-2">
              Widget Domain
              <input
                value={config.tradingView.widgetDomain ?? "tradingview.com"}
                onChange={(e) => setTradingViewConfig({ widgetDomain: e.target.value || "tradingview.com" })}
                placeholder="tradingview.com"
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none focus:border-[#F5C542]/50"
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-[#6B6F76]">
            These credentials are stored in localStorage (dev mode). In production, move secrets to encrypted backend storage.
          </p>
        </CollapsiblePanel>
        )}

        {shouldShow("branding") && (
        <CollapsiblePanel
          title="Branding"
          description="Sidebar logo and collapsed emblem upload"
          open={panelState.branding}
          onToggle={() => togglePanel("branding")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
              <p className="mb-2 text-xs font-semibold text-white">Logo (Expanded Menu)</p>
              <div className="mb-2 grid h-[84px] w-[84px] place-items-center rounded-xl border border-white/10 bg-transparent">
                {config.branding.logoDataUrl ? (
                  <img src={config.branding.logoDataUrl} alt="Uploaded logo" className="h-[72px] w-[72px] rounded-lg object-contain" />
                ) : (
                  <span className="text-sm font-semibold text-[#6B6F76]">No Logo</span>
                )}
              </div>
              <div className="space-y-2">
                <label className="inline-flex cursor-pointer items-center rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-xs text-[#BFC2C7]">
                  Upload Logo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > MAX_UPLOAD_BYTES) {
                        setValidationMsg("Image is too large. Please upload a file smaller than 12MB.");
                        e.currentTarget.value = "";
                        return;
                      }
                      try {
                        const raw = await fileToDataUrl(file);
                        const optimized = await optimizeImageToBudget(raw, MAX_LOGO_CHARS, 768);
                        if (optimized.length > MAX_LOGO_CHARS) {
                          setValidationMsg("Logo is still too large after optimization. Please try a lower-resolution image.");
                          e.currentTarget.value = "";
                          return;
                        }
                        setBrandingLogo(optimized);
                        setValidationMsg(null);
                      } catch {
                        setValidationMsg("Logo upload failed. Please try a different image.");
                      }
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <button type="button" onClick={() => setBrandingLogo(undefined)} className="ml-2 rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">
                  Remove Logo
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
              <p className="mb-2 text-xs font-semibold text-white">Emblem (Collapsed Menu)</p>
              <div className="mb-2 grid h-[84px] w-[84px] place-items-center rounded-xl border border-white/10 bg-transparent">
                {config.branding.emblemDataUrl ? (
                  <img src={config.branding.emblemDataUrl} alt="Uploaded emblem" className="h-[72px] w-[72px] rounded-lg object-contain" />
                ) : (
                  <span className="text-sm font-semibold text-[#6B6F76]">No Emblem</span>
                )}
              </div>
              <div className="space-y-2">
                <label className="inline-flex cursor-pointer items-center rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-xs text-[#BFC2C7]">
                  Upload Emblem
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > MAX_UPLOAD_BYTES) {
                        setValidationMsg("Image is too large. Please upload a file smaller than 12MB.");
                        e.currentTarget.value = "";
                        return;
                      }
                      try {
                        const raw = await fileToDataUrl(file);
                        const optimized = await optimizeImageToBudget(raw, MAX_EMBLEM_CHARS, 512);
                        if (optimized.length > MAX_EMBLEM_CHARS) {
                          setValidationMsg("Emblem is still too large after optimization. Please try a lower-resolution image.");
                          e.currentTarget.value = "";
                          return;
                        }
                        setBrandingEmblem(optimized);
                        setValidationMsg(null);
                      } catch {
                        setValidationMsg("Emblem upload failed. Please try a different image.");
                      }
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <button type="button" onClick={() => setBrandingEmblem(undefined)} className="ml-2 rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">
                  Remove Emblem
                </button>
              </div>
            </div>
          </div>
        </CollapsiblePanel>
        )}

        {shouldShow("payments") && (
        <CollapsiblePanel
          title="Payment Review"
          description="Monitor invoices, pending payments, and manual confirmations"
          open={panelState.payments}
          onToggle={() => togglePanel("payments")}
        >
          <PaymentReviewPanel />
        </CollapsiblePanel>
        )}

        {shouldShow("logs") && (
        <CollapsiblePanel
          title="System Logs"
          description="Event logs, error tracking, and operational monitoring"
          open={panelState.logs}
          onToggle={() => togglePanel("logs")}
        >
          <LogsPanel />
        </CollapsiblePanel>
        )}

        {shouldShow("bugReports") && (
        <CollapsiblePanel
          title="Bug Reports"
          description="Track and manage bug reports from users and internal team"
          open={panelState.bugReports}
          onToggle={() => togglePanel("bugReports")}
        >
          <BugReportsPanel />
        </CollapsiblePanel>
        )}

        {shouldShow("killSwitch") && (
        <CollapsiblePanel
          title="Kill Switch"
          description="Emergency trading halt — activate/deactivate per level"
          open={panelState.killSwitch}
          onToggle={() => togglePanel("killSwitch")}
        >
          <KillSwitchPanel />
        </CollapsiblePanel>
        )}

        {shouldShow("tradeTrace") && (
        <CollapsiblePanel
          title="Trade Trace"
          description="Pipeline event trace for order intents"
          open={panelState.tradeTrace}
          onToggle={() => togglePanel("tradeTrace")}
        >
          <TradeTracePanel />
        </CollapsiblePanel>
        )}

        {shouldShow("circuitBreaker") && (
        <CollapsiblePanel
          title="Exchange Core Status"
          description="Circuit breakers, queues, and engine metrics"
          open={panelState.circuitBreaker}
          onToggle={() => togglePanel("circuitBreaker")}
        >
          <CircuitBreakerPanel />
        </CollapsiblePanel>
        )}

        {validationMsg ? <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">{validationMsg}</div> : null}
        {persistError ? <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">{persistError}</div> : null}
        {providersSyncError ? (
          <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">
            Provider config sync warning: {providersSyncError}
          </div>
        ) : null}
      </div>

      <ProviderFormModal
        open={modalOpen}
        initial={editingProvider}
        onClose={() => setModalOpen(false)}
        onSave={(provider) => {
          if (editingProvider) updateProvider(provider);
          else addProvider({ ...provider, lastTestStatus: "UNKNOWN" });
        }}
      />

      {deleteTarget ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#121316] p-4">
            <p className="text-sm font-semibold text-white">Delete provider?</p>
            <p className="mt-1 text-xs text-[#6B6F76]">This will remove {deleteTarget.name} and unassign its mappings.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded border border-white/15 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7]">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  removeProvider(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                className="rounded border border-[#704844] bg-[#271a19] px-3 py-1.5 text-xs text-[#d6b3af]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
