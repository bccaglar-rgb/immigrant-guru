import { useEffect, useMemo, useState } from "react";
import type { AiModelConfig } from "../types";
import { getAiProviderIcon, getExchangeBranding } from "../data/branding";
import { writeExchangeAccounts } from "../hooks/useExchangeConfigs";
import { useAuthStore } from "../hooks/useAuthStore";
import { ConnectApiModal, type ConnectApiPayload } from "../components/exchange/ConnectApiModal";
import { authHeaders } from "../services/exchangeApi";
import {
  applyPaletteToRoot,
  getPaletteById,
  isValidHex,
  PREDEFINED_PALETTES,
  readStoredTheme,
  resolveEffectivePalette,
  type SitePalette,
  writeStoredTheme,
} from "../theme/siteTheme";

type ExchangeOnboardingStatus = "READY" | "PARTIAL" | "FAILED";
interface ExchangeConnectionSummary {
  exchangeId: string;
  exchangeDisplayName: string;
  accountName?: string;
  status: ExchangeOnboardingStatus;
  enabled: boolean;
  marketTypes?: string[];
  symbolsCount?: number;
  checkedAt?: string;
}
interface ExchangeConnectReport {
  exchangeDisplayName: string;
  overallStatus: ExchangeOnboardingStatus;
  warnings: string[];
  errors: Array<{ code: string; message: string }>;
  autoSettings: {
    applied: Array<{ key: string; value: string | number | boolean }>;
    notApplied: Array<{ key: string; reason: string }>;
    manualInstructions: string[];
  };
  discovery: {
    marketTypes: string[];
    marketsCount: number;
  };
}

const EXCHANGE_MANAGER_STORAGE_KEY = "exchange-manager-connections-v1";
const MODELS_KEY = "admin-ai-models-v1";

type ProviderPreset = {
  provider: string;
  label: string;
  badge: string;
};

const AI_PROVIDER_PRESETS: ProviderPreset[] = [
  { provider: "DeepSeek", label: "DeepSeek", badge: "DEEPSEEK" },
  { provider: "Qwen", label: "Qwen", badge: "QWEN" },
  { provider: "OpenAI", label: "OpenAI", badge: "OPENAI" },
  { provider: "Claude", label: "Claude", badge: "CLAUDE" },
  { provider: "Google Gemini", label: "Google Gemini", badge: "GEMINI" },
  { provider: "Grok", label: "Grok (xAI)", badge: "GROK" },
  { provider: "Kimi", label: "Kimi (Moonshot)", badge: "KIMI" },
  { provider: "Perplexity", label: "Perplexity", badge: "PERPLEXITY" },
];

const nowIso = () => new Date().toISOString();
const makeId = () => Math.random().toString(36).slice(2, 10);

const timeAgo = (iso: string | undefined): string => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

type BalanceMap = Record<string, { usdt: number | null; fetchedAt: string | null }>;

const parseJsonResponse = async <T,>(res: Response): Promise<T> => {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Server returned non-JSON content (${res.status}). Backend API may be down or route is missing. Start 'npm run server:dev' from project root.`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Server returned invalid JSON.");
  }
};

const readStoredManagerConnections = (): ExchangeConnectionSummary[] => {
  try {
    const raw = window.localStorage.getItem(EXCHANGE_MANAGER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExchangeConnectionSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readStoredModels = (): AiModelConfig[] => {
  try {
    const raw = window.localStorage.getItem(MODELS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AiModelConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};


const isValidUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const mask = (value?: string) => {
  if (!value) return "-";
  if (value.length <= 6) return "*".repeat(value.length);
  return `${value.slice(0, 3)}${"*".repeat(Math.max(4, value.length - 6))}${value.slice(-3)}`;
};

const colorKeys: Array<keyof SitePalette["colors"]> = [
  "background",
  "panel",
  "border",
  "textPrimary",
  "textSecondary",
  "accentPrimary",
  "accentSecondary",
];

const labelForKey: Record<keyof SitePalette["colors"], string> = {
  background: "background",
  panel: "panel",
  border: "border",
  textPrimary: "textPrimary",
  textSecondary: "textSecondary",
  accentPrimary: "accentPrimary",
  accentSecondary: "accentSecondary",
};

const defaultModelForm = {
  name: "",
  provider: "",
  type: "Hosted" as "Hosted" | "Local",
  endpoint: "",
  apiKey: "",
  enabled: true,
  priority: 1,
  notes: "",
};

type ModelForm = typeof defaultModelForm;

export default function SettingsPage() {
  const [themeState, setThemeState] = useState(() => readStoredTheme());
  const [connectError, setConnectError] = useState<string | null>(null);
  const [latestReport, setLatestReport] = useState<ExchangeConnectReport | null>(null);
  const [exchangeRows, setExchangeRows] = useState<ExchangeConnectionSummary[]>(() => readStoredManagerConnections());
  const [themePanelOpen, setThemePanelOpen] = useState(true);
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [exchangeEditMode, setExchangeEditMode] = useState<{ exchangeId: string; accountName: string } | null>(null);

  const [models, setModels] = useState<AiModelConfig[]>(() => readStoredModels());
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [modelStep, setModelStep] = useState<1 | 2>(1);
  const [modelForm, setModelForm] = useState<ModelForm>(defaultModelForm);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({});

  const authUser = useAuthStore((s) => s.user);

  const [balances, setBalances] = useState<BalanceMap>({});

  // Fetch USDT balance for each connected exchange on mount and when rows change
  useEffect(() => {
    let cancelled = false;
    const fetchBalances = async () => {
      const readyRows = exchangeRows.filter((r) => r.status === "READY" || r.status === "PARTIAL");
      if (!readyRows.length) return;
      const results: BalanceMap = {};
      await Promise.allSettled(
        readyRows.map(async (row) => {
          const key = `${row.exchangeId}::${row.accountName ?? "Main"}`;
          try {
            const q = new URLSearchParams({ symbol: "BTCUSDT" });
            if (row.accountName?.trim()) q.set("accountName", row.accountName.trim());
            const res = await fetch(`/api/exchanges/${encodeURIComponent(row.exchangeId)}/account?${q.toString()}`, {
              headers: { ...authHeaders() },
            });
            if (!res.ok) { results[key] = { usdt: null, fetchedAt: null }; return; }
            const data = await res.json() as { balances?: Array<{ asset: string; available: number; total: number }> ; fetchedAt?: string };
            const usdtEntry = (data.balances ?? []).find((b) => b.asset === "USDT");
            results[key] = {
              usdt: usdtEntry ? usdtEntry.total : null,
              fetchedAt: data.fetchedAt ?? null,
            };
          } catch {
            results[key] = { usdt: null, fetchedAt: null };
          }
        }),
      );
      if (!cancelled) setBalances((prev) => ({ ...prev, ...results }));
    };
    void fetchBalances();
    return () => { cancelled = true; };
  }, [exchangeRows]);

  const effectivePalette = useMemo(() => resolveEffectivePalette(themeState), [themeState]);
  const activePalette = useMemo(() => getPaletteById(themeState.paletteId), [themeState.paletteId]);
  const customEnabled = themeState.customEnabled;
  const customColors = themeState.customColors ?? PREDEFINED_PALETTES[0].colors;

  const membership = useMemo(() => {
    if (!authUser?.hasActivePlan) {
      return { status: "No Active Plan", daysLeft: 0, monthsLeft: 0, expiresLabel: "-", tier: "none" };
    }
    const tier = authUser.activePlanTier ?? "explorer";
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    if (!authUser.activePlanEndAt) {
      return { status: `${tierLabel} Active`, daysLeft: 999, monthsLeft: 33, expiresLabel: "Unlimited", tier };
    }
    const now = Date.now();
    const exp = new Date(authUser.activePlanEndAt).getTime();
    const diffMs = exp - now;
    const daysLeft = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    const monthsLeft = Math.max(0, Math.floor(daysLeft / 30));
    const status = daysLeft > 0 ? `${tierLabel} Active` : "Expired";
    return {
      status,
      daysLeft,
      monthsLeft,
      expiresLabel: new Date(authUser.activePlanEndAt).toLocaleDateString(),
      tier,
    };
  }, [authUser]);

  const modelValidation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!modelForm.provider.trim()) errors.provider = "Provider is required.";
    if (!modelForm.name.trim()) errors.name = "Model name is required.";
    if (modelForm.type === "Hosted" && modelForm.endpoint && !isValidUrl(modelForm.endpoint)) {
      errors.endpoint = "Endpoint must be a valid URL.";
    }
    if (!Number.isFinite(modelForm.priority) || modelForm.priority < 0) {
      errors.priority = "Priority must be >= 0.";
    }
    return errors;
  }, [modelForm]);

  useEffect(() => {
    window.localStorage.setItem(MODELS_KEY, JSON.stringify(models));
    window.dispatchEvent(new Event("admin-config-updated"));
  }, [models]);

  const refreshExchangeRows = async () => {
    try {
      const res = await fetch("/api/exchanges", { headers: { ...authHeaders() } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await parseJsonResponse<{ exchanges?: ExchangeConnectionSummary[] }>(res);
      const rows = body.exchanges ?? [];
      setExchangeRows(rows);
      window.localStorage.setItem(EXCHANGE_MANAGER_STORAGE_KEY, JSON.stringify(rows));
      window.dispatchEvent(new Event("exchange-manager-updated"));
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Failed to load exchange list.");
    }
  };

  const setAndApply = (next: typeof themeState) => {
    setThemeState(next);
    writeStoredTheme(next);
    applyPaletteToRoot(resolveEffectivePalette(next));
  };

  const applyPalette = (paletteId: string) => {
    setAndApply({
      ...themeState,
      paletteId,
      customEnabled: false,
    });
  };

  const toggleCustom = (enabled: boolean) => {
    setAndApply({
      ...themeState,
      customEnabled: enabled,
      customColors: themeState.customColors ?? { ...activePalette.colors },
    });
  };

  const updateCustomColor = (key: keyof SitePalette["colors"], value: string) => {
    const nextCustom = {
      ...(themeState.customColors ?? { ...activePalette.colors }),
      [key]: value,
    };
    const nextState = {
      ...themeState,
      customEnabled: true,
      customColors: nextCustom,
    };
    setThemeState(nextState);
    if (
      colorKeys.every((colorKey) => {
        const raw = (nextCustom[colorKey] ?? "").trim();
        if (!raw) return colorKey === "accentSecondary";
        return isValidHex(raw);
      })
    ) {
      writeStoredTheme(nextState);
      applyPaletteToRoot(resolveEffectivePalette(nextState));
    }
  };

  const resetTheme = () => {
    const next = {
      paletteId: PREDEFINED_PALETTES[0].id,
      customEnabled: false,
      customColors: null,
    };
    setAndApply(next);
  };

  const handleModalSave = async (payload: ConnectApiPayload): Promise<{ ok: boolean; error?: string }> => {
    setConnectError(null);
    const sameExchangeCount = exchangeRows.filter((row) => row.exchangeId === payload.exchangeId).length;
    if (!exchangeEditMode && sameExchangeCount >= 20) {
      return { ok: false, error: "Maximum 20 accounts per exchange." };
    }
    try {
      const res = await fetch("/api/exchanges/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          exchangeId: payload.exchangeId,
          credentials: {
            apiKey: payload.apiKey,
            apiSecret: payload.apiSecret,
            ...(payload.passphrase ? { passphrase: payload.passphrase } : {}),
          },
          options: {
            accountName: payload.accountName,
            environment: payload.testnet ? "testnet" : "mainnet",
            marketType: "both",
            defaultLeverage: 5,
            preferredMarginMode: "isolated",
            preferredPositionMode: "one-way",
          },
        }),
      });
      const body = await parseJsonResponse<{ ok: boolean; report?: ExchangeConnectReport; message?: string; error?: string }>(res);
      if (!res.ok || !body.ok || !body.report) {
        return { ok: false, error: body.message ?? body.error ?? "Connection failed" };
      }
      setLatestReport(body.report);
      setExchangeModalOpen(false);
      setExchangeEditMode(null);
      await refreshExchangeRows();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  };

  const handleModalTest = async (payload: { exchangeId: string; apiKey: string; apiSecret: string; passphrase?: string; testnet: boolean }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/exchanges/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          exchangeId: payload.exchangeId,
          credentials: {
            apiKey: payload.apiKey,
            apiSecret: payload.apiSecret,
            ...(payload.passphrase ? { passphrase: payload.passphrase } : {}),
          },
          options: {
            accountName: "__test__",
            environment: payload.testnet ? "testnet" : "mainnet",
            marketType: "both",
            dryRun: true,
          },
        }),
      });
      const body = await parseJsonResponse<{ ok: boolean; message?: string; error?: string }>(res);
      return { ok: res.ok && body.ok, error: body.message ?? body.error };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Test failed" };
    }
  };

  const openAddExchange = () => {
    setExchangeEditMode(null);
    setExchangeModalOpen(true);
  };

  const editExchangeRow = (row: ExchangeConnectionSummary) => {
    setExchangeEditMode({ exchangeId: row.exchangeId, accountName: row.accountName ?? "Main" });
    setExchangeModalOpen(true);
  };

  const deleteExchangeRow = async (row: ExchangeConnectionSummary) => {
    setConnectError(null);
    try {
      const q = new URLSearchParams();
      if (row.accountName) q.set("accountName", row.accountName);
      const url = `/api/exchanges/${encodeURIComponent(row.exchangeId)}${q.toString() ? `?${q.toString()}` : ""}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      const body = await parseJsonResponse<{ ok: boolean; message?: string; error?: string }>(res);
      if (!res.ok || !body.ok) throw new Error(body.message ?? body.error ?? "Delete failed");
      await refreshExchangeRows();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const openAddModel = () => {
    setEditingModelId(null);
    setModelForm(defaultModelForm);
    setModelErrors({});
    setModelStep(1);
    setModelModalOpen(true);
  };

  const submitModel = () => {
    setModelErrors(modelValidation);
    if (Object.keys(modelValidation).length) return;

    if (editingModelId) {
      setModels((prev) =>
        prev.map((item) =>
          item.id === editingModelId
            ? {
                ...item,
                name: modelForm.name.trim(),
                type: modelForm.type,
                endpoint: modelForm.endpoint.trim() || undefined,
                apiKey: modelForm.apiKey.trim() || undefined,
                enabled: modelForm.enabled,
                priority: modelForm.priority,
                notes: modelForm.notes.trim() || undefined,
                updatedAt: nowIso(),
              }
            : item,
        ),
      );
    } else {
      const next: AiModelConfig = {
        id: makeId(),
        name: modelForm.name.trim(),
        type: modelForm.type,
        endpoint: modelForm.endpoint.trim() || undefined,
        apiKey: modelForm.apiKey.trim() || undefined,
        enabled: modelForm.enabled,
        priority: modelForm.priority,
        notes: modelForm.notes.trim() || undefined,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      setModels((prev) => [next, ...prev]);
    }

    setModelModalOpen(false);
  };

  const startEditModel = (model: AiModelConfig) => {
    const preset = AI_PROVIDER_PRESETS.find((p) => model.name.toLowerCase().includes(p.provider.toLowerCase()));
    setEditingModelId(model.id);
    setModelForm({
      name: model.name,
      provider: preset?.provider ?? model.name,
      type: model.type,
      endpoint: model.endpoint ?? "",
      apiKey: model.apiKey ?? "",
      enabled: model.enabled,
      priority: model.priority,
      notes: model.notes ?? "",
    });
    setModelErrors({});
    setModelStep(2);
    setModelModalOpen(true);
  };

  useEffect(() => {
    void refreshExchangeRows();
  }, []);

  useEffect(() => {
    if (!exchangeRows.length) return;
    writeExchangeAccounts(exchangeRows);
  }, [exchangeRows]);

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--textMuted)] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        <section className="rounded-2xl border border-[var(--borderSoft)] bg-[var(--panel)] p-4">
          <h1 className="text-lg font-semibold text-[var(--text)]">Settings</h1>
          <p className="text-xs text-[var(--textMuted)]">Manage your membership, exchange APIs, and AI model APIs.</p>
        </section>

        <section className="rounded-2xl border border-[var(--borderSoft)] bg-[var(--panel)] p-4">
          <h2 className="text-base font-semibold text-[var(--text)]">Membership Center</h2>
          <p className="mt-0.5 text-xs text-[var(--textMuted)]">Track your subscription status and remaining time.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3">
              <p className="text-[11px] uppercase tracking-wider text-[var(--textMuted)]">Current Status</p>
              <p className={`mt-2 text-xl font-semibold ${membership.daysLeft > 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>{membership.status}</p>
            </div>
            <div className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3">
              <p className="text-[11px] uppercase tracking-wider text-[var(--textMuted)]">Expires On</p>
              <p className="mt-2 text-xl font-semibold text-[var(--text)]">{membership.expiresLabel}</p>
            </div>
            <div className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3">
              <p className="text-[11px] uppercase tracking-wider text-[var(--textMuted)]">Time Left</p>
              <p className="mt-2 text-xl font-semibold text-[var(--accent)]">{membership.monthsLeft} months · {membership.daysLeft} days</p>
            </div>
          </div>
        </section>

        <section id="exchange-panel" className="rounded-2xl border border-[var(--borderSoft)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]">Exchange Panel</h2>
              <p className="text-xs text-[var(--textMuted)]">Connect your exchange APIs and manage live trading access.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshExchangeRows()}
                className="rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-1.5 text-xs text-[var(--textMuted)] hover:opacity-90"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={openAddExchange}
                className="rounded-lg border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]"
              >
                + Add Exchange API
              </button>
            </div>
          </div>

          {connectError && (
            <p className="mb-3 rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">{connectError}</p>
          )}

          <div className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3">
            <p className="mb-2 text-xs uppercase tracking-wider text-[var(--textMuted)]">Connected Exchange Accounts</p>
            <div className="space-y-2">
              {exchangeRows.length ? (
                exchangeRows.map((row) => {
                  const balKey = `${row.exchangeId}::${row.accountName ?? "Main"}`;
                  const bal = balances[balKey];
                  const checkedLabel = timeAgo(row.checkedAt);
                  return (
                  <div key={`${row.exchangeId}-${row.accountName ?? "main"}-${row.checkedAt ?? row.exchangeDisplayName}`} className="rounded-lg border border-[var(--borderSoft)] bg-[var(--panel)] px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 font-semibold text-[var(--text)]">
                        <span
                          className="relative inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                          title={
                            row.status === "READY" ? "Connected"
                              : row.status === "PARTIAL" ? "Connecting..."
                                : "Connection failed"
                          }
                          style={{
                            backgroundColor:
                              row.status === "READY" ? "#4ade80"
                                : row.status === "PARTIAL" ? "#facc15"
                                  : "#f87171",
                          }}
                        />
                        <img
                          src={getExchangeBranding(row.exchangeId).iconUrl}
                          alt={row.exchangeDisplayName}
                          className="h-6 w-6 rounded-full border border-white/10 object-cover"
                        />
                        <span>{row.exchangeDisplayName}</span>
                        <span className="rounded border border-white/10 bg-[var(--panelMuted)] px-1.5 py-0.5 text-[11px] text-[var(--textMuted)]">
                          {row.accountName ?? "Main"}
                        </span>
                        <span className={`text-[11px] font-normal ${
                          row.status === "READY" ? "text-[#4ade80]"
                            : row.status === "PARTIAL" ? "text-[#facc15]"
                              : "text-[#f87171]"
                        }`}>
                          {row.status === "READY" ? "Connected" : row.status === "PARTIAL" ? "Connecting..." : "Failed"}
                        </span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => editExchangeRow(row)}
                          className="rounded border border-white/15 bg-[var(--panelMuted)] px-2 py-0.5 text-[10px] text-[var(--textMuted)] hover:text-[var(--text)] transition"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteExchangeRow(row)}
                          className="rounded border border-[#704844] bg-[#271a19] px-2 py-0.5 text-[10px] text-[#d6b3af] hover:opacity-80 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-xs text-[var(--textMuted)]">
                        {row.marketTypes?.join(", ").toUpperCase() || "-"} · {row.symbolsCount ?? 0} symbols
                        {row.status === "FAILED" && " · Connection failed"}
                      </p>
                      {checkedLabel && (
                        <span className="text-[10px] text-[var(--textMuted)] opacity-60">Last checked: {checkedLabel}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs">
                      <span className="text-[var(--textMuted)]">Balance: </span>
                      {bal?.usdt != null ? (
                        <span className="font-mono text-[var(--text)]">{"$"}{bal.usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
                      ) : (
                        <span className="text-[var(--textMuted)]">--</span>
                      )}
                    </p>
                  </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--borderSoft)] bg-[var(--panel)] p-6 text-center">
                  <p className="text-sm text-[var(--textMuted)]">No exchange connected yet.</p>
                  <p className="mt-1 text-xs text-[var(--textMuted)]">
                    Click <button type="button" onClick={openAddExchange} className="font-semibold text-[var(--accent)] hover:underline">+ Add Exchange API</button> to connect your first exchange.
                  </p>
                </div>
              )}
            </div>
          </div>

          {latestReport && (
            <div className="mt-3 rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--text)]">{latestReport.exchangeDisplayName} onboarding report</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  latestReport.overallStatus === "READY"
                    ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]"
                    : latestReport.overallStatus === "PARTIAL"
                      ? "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]"
                      : "border-[#704844] bg-[#271a19] text-[#d6b3af]"
                }`}>{latestReport.overallStatus}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--textMuted)]">Markets: {latestReport.discovery.marketsCount} · Types: {latestReport.discovery.marketTypes.join(", ")}</p>
            </div>
          )}
        </section>

        <section id="ai-panel" className="rounded-2xl border border-[var(--borderSoft)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]">AI Panel</h2>
              <p className="text-xs text-[var(--textMuted)]">Add and manage model APIs. Your configured models appear below.</p>
            </div>
            <button
              type="button"
              onClick={openAddModel}
              className="rounded-lg border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]"
            >
              + New model
            </button>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {models.length ? (
              models.map((model) => (
                <article key={model.id} className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                      <img
                        src={getAiProviderIcon(model.name)}
                        alt={model.name}
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.onerror = null;
                          target.src = getAiProviderIcon(`ai-${model.name}`);
                        }}
                        className="h-5 w-5 rounded-full border border-white/10 bg-[#101318] object-cover"
                      />
                      {model.name}
                    </p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${model.enabled ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]" : "border-[#704844] bg-[#271a19] text-[#d6b3af]"}`}>
                      {model.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--textMuted)]">Type: {model.type}</p>
                  <p className="text-xs text-[var(--textMuted)]">Endpoint: {model.endpoint ?? "-"}</p>
                  <p className="text-xs text-[var(--textMuted)]">API Key: {mask(model.apiKey)}</p>
                  <p className="text-xs text-[var(--textMuted)]">Priority: {model.priority}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEditModel(model)}
                      className="rounded border border-white/15 bg-[var(--panel)] px-2 py-1 text-[11px] text-[var(--textMuted)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setModels((prev) => prev.map((item) => item.id === model.id ? { ...item, enabled: !item.enabled, updatedAt: nowIso() } : item))}
                      className="rounded border border-white/15 bg-[var(--panel)] px-2 py-1 text-[11px] text-[var(--textMuted)]"
                    >
                      {model.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModels((prev) => prev.filter((item) => item.id !== model.id))}
                      className="rounded border border-[#704844] bg-[#271a19] px-2 py-1 text-[11px] text-[#d6b3af]"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="col-span-full rounded-xl border border-dashed border-[var(--borderSoft)] bg-[var(--panelMuted)] p-4 text-sm text-[var(--textMuted)]">
                No AI model configured yet. Click <span className="font-semibold text-[var(--accent)]">+ New model</span> to add one.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--borderSoft)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]">Theme / Colors</h2>
              <p className="text-xs text-[var(--textMuted)]">Palette is applied live and persisted across refresh.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setThemePanelOpen((v) => !v)}
                className="rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-2 py-1.5 text-xs text-[var(--textMuted)] hover:opacity-90"
              >
                {themePanelOpen ? "Hide" : "Show"} {themePanelOpen ? "▾" : "▸"}
              </button>
              <button
                type="button"
                onClick={resetTheme}
                className="rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-1.5 text-xs text-[var(--textMuted)] hover:opacity-90"
              >
                Reset Theme
              </button>
            </div>
          </div>

          {themePanelOpen ? (
            <>
              <div className="mb-4 rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text)]">Current Palette: {customEnabled ? "Custom" : activePalette.name}</p>
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]"
                    style={{ borderColor: "var(--accent)", backgroundColor: "var(--panel)" }}
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                    Live preview
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  {colorKeys.map((key) => {
                    const value = effectivePalette[key] ?? "#000000";
                    return (
                      <div key={key} className="rounded-lg border border-[var(--borderSoft)] bg-[var(--panel)] p-2">
                        <div className="h-8 w-full rounded border border-[var(--borderSoft)]" style={{ backgroundColor: value }} />
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--textMuted)]">{labelForKey[key]}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {PREDEFINED_PALETTES.map((palette) => {
                  const isActive = !customEnabled && themeState.paletteId === palette.id;
                  return (
                    <button
                      type="button"
                      key={palette.id}
                      onClick={() => applyPalette(palette.id)}
                      className={`rounded-xl border p-3 text-left transition ${
                        isActive
                          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
                          : "border-[var(--borderSoft)] bg-[var(--panelMuted)] hover:opacity-90"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-[var(--text)]">{palette.name}</p>
                        <span className="text-[10px] text-[var(--textMuted)]">{isActive ? "Applied" : "Apply"}</span>
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {colorKeys.slice(0, 6).map((key) => (
                          <span key={key} className="h-5 rounded border border-[var(--borderSoft)]" style={{ backgroundColor: palette.colors[key] ?? "#000000" }} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={customEnabled} onChange={(e) => toggleCustom(e.target.checked)} />
                    Enable Custom
                  </label>
                  {customEnabled ? <span className="text-xs text-[var(--textMuted)]">Hex format: #RRGGBB</span> : null}
                </div>

                {customEnabled ? (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {colorKeys.filter((k) => k !== "accentSecondary").map((key) => {
                      const value = customColors[key] ?? "";
                      const valid = isValidHex(value);
                      return (
                        <label key={key} className="text-xs text-[var(--textMuted)]">
                          {labelForKey[key]}
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              value={value}
                              onChange={(e) => updateCustomColor(key, e.target.value)}
                              className={`w-full rounded-lg border bg-[var(--panel)] px-2 py-1.5 text-xs text-[var(--text)] outline-none ${
                                valid ? "border-[var(--borderSoft)]" : "border-[#704844]"
                              }`}
                              placeholder="#000000"
                            />
                            <span className="h-7 w-7 rounded border border-[var(--borderSoft)]" style={{ backgroundColor: valid ? value : "transparent" }} />
                          </div>
                          {!valid ? <span className="mt-1 block text-[10px] text-[#d6b3af]">Invalid hex</span> : null}
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      </div>

      <ConnectApiModal
        open={exchangeModalOpen}
        onClose={() => { setExchangeModalOpen(false); setExchangeEditMode(null); }}
        onSave={handleModalSave}
        onTest={handleModalTest}
        editMode={exchangeEditMode}
      />

      {modelModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[var(--panel)] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">{editingModelId ? "Update AI Model" : "Add AI Model"}</h3>
              <button type="button" onClick={() => setModelModalOpen(false)} className="text-sm text-[var(--textMuted)]">✕</button>
            </div>

            <div className="mb-4 flex items-center gap-2 text-xs">
              <span className={`rounded-full border px-2 py-0.5 ${modelStep === 1 ? "border-[var(--accent)] text-[var(--accent)]" : "border-white/15 text-[var(--textMuted)]"}`}>1 Select Model</span>
              <span className="text-[var(--textMuted)]">—</span>
              <span className={`rounded-full border px-2 py-0.5 ${modelStep === 2 ? "border-[var(--accent)] text-[var(--accent)]" : "border-white/15 text-[var(--textMuted)]"}`}>2 Configure API</span>
            </div>

            {modelStep === 1 ? (
              <>
                <p className="mb-2 text-sm text-[var(--text)]">Choose your AI provider</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {AI_PROVIDER_PRESETS.map((item) => (
                    <button
                      type="button"
                      key={item.provider}
                      onClick={() => {
                        setModelForm((prev) => ({ ...prev, provider: item.provider, name: item.label }));
                        setModelStep(2);
                      }}
                      className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3 text-left hover:border-[var(--accent)]"
                    >
                      <img
                        src={getAiProviderIcon(item.provider)}
                        alt={item.label}
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.onerror = null;
                          target.src = getAiProviderIcon(`ai-${item.provider}`);
                        }}
                        className="mb-3 h-10 w-10 rounded-lg border border-white/10 bg-[var(--panel)] object-cover p-1"
                      />
                      <p className="text-sm font-semibold text-[var(--text)]">{item.label}</p>
                      <span className="mt-1 inline-flex rounded-full border border-white/10 bg-[var(--panel)] px-2 py-0.5 text-[10px] text-[var(--textMuted)]">{item.badge}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-[var(--textMuted)]">Provider
                  <input value={modelForm.provider} onChange={(e) => setModelForm((p) => ({ ...p, provider: e.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none" />
                  {modelErrors.provider ? <span className="mt-1 block text-[11px] text-[#d6b3af]">{modelErrors.provider}</span> : null}
                </label>
                <label className="text-xs text-[var(--textMuted)]">Model Name
                  <input value={modelForm.name} onChange={(e) => setModelForm((p) => ({ ...p, name: e.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none" />
                  {modelErrors.name ? <span className="mt-1 block text-[11px] text-[#d6b3af]">{modelErrors.name}</span> : null}
                </label>
                <label className="text-xs text-[var(--textMuted)]">Type
                  <select value={modelForm.type} onChange={(e) => setModelForm((p) => ({ ...p, type: e.target.value as "Hosted" | "Local" }))} className="mt-1 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none">
                    <option value="Hosted">Hosted</option>
                    <option value="Local">Local</option>
                  </select>
                </label>
                <label className="text-xs text-[var(--textMuted)]">Priority
                  <input type="number" min={0} value={modelForm.priority} onChange={(e) => setModelForm((p) => ({ ...p, priority: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none" />
                  {modelErrors.priority ? <span className="mt-1 block text-[11px] text-[#d6b3af]">{modelErrors.priority}</span> : null}
                </label>
                <label className="text-xs text-[var(--textMuted)] md:col-span-2">Endpoint (optional)
                  <input value={modelForm.endpoint} onChange={(e) => setModelForm((p) => ({ ...p, endpoint: e.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none" placeholder="https://..." />
                  {modelErrors.endpoint ? <span className="mt-1 block text-[11px] text-[#d6b3af]">{modelErrors.endpoint}</span> : null}
                </label>
                <label className="text-xs text-[var(--textMuted)] md:col-span-2">API Key (optional)
                  <input type="password" value={modelForm.apiKey} onChange={(e) => setModelForm((p) => ({ ...p, apiKey: e.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none" />
                </label>
                <label className="text-xs text-[var(--textMuted)] md:col-span-2">Notes
                  <textarea value={modelForm.notes} onChange={(e) => setModelForm((p) => ({ ...p, notes: e.target.value }))} className="mt-1 min-h-24 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none" />
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-[var(--textMuted)] md:col-span-2">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={modelForm.enabled} onChange={(e) => setModelForm((p) => ({ ...p, enabled: e.target.checked }))} />
                  Enabled
                </label>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => (modelStep === 2 ? setModelStep(1) : setModelModalOpen(false))}
                className="rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-1.5 text-xs text-[var(--textMuted)]"
              >
                {modelStep === 2 ? "Back" : "Cancel"}
              </button>
              {modelStep === 2 ? (
                <button
                  type="button"
                  onClick={submitModel}
                  className="rounded-lg border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]"
                >
                  {editingModelId ? "Save model" : "Add model"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
