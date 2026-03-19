import { useEffect, useMemo, useState } from "react";
import { getExchangeBranding } from "../../data/branding";

interface ExchangeOption {
  id: string;
  label: string;
  hasAdapter: boolean;
}

export interface ConnectApiPayload {
  exchangeId: string;
  accountName: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  testnet: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (payload: ConnectApiPayload) => Promise<{ ok: boolean; error?: string }>;
  onTest: (payload: { exchangeId: string; apiKey: string; apiSecret: string; passphrase?: string; testnet: boolean }) => Promise<{ ok: boolean; error?: string }>;
  /** Pre-select exchange + accountName when editing */
  editMode?: { exchangeId: string; accountName: string } | null;
}

/** Exchanges with a working backend adapter */
const ADAPTER_IDS = new Set(["binance", "gate", "bybit", "okx"]);

const SUPPORTED_EXCHANGES: ExchangeOption[] = [
  { id: "binance", label: "Binance", hasAdapter: true },
  { id: "gate", label: "Gate.io", hasAdapter: true },
  { id: "bybit", label: "Bybit", hasAdapter: true },
  { id: "okx", label: "OKX", hasAdapter: true },
  { id: "coinbase", label: "Coinbase", hasAdapter: false },
  { id: "kraken", label: "Kraken", hasAdapter: false },
  { id: "kucoin", label: "KuCoin", hasAdapter: false },
  { id: "bitget", label: "Bitget", hasAdapter: false },
  { id: "mexc", label: "MEXC", hasAdapter: false },
  { id: "htx", label: "HTX", hasAdapter: false },
  { id: "hyperliquid", label: "Hyperliquid", hasAdapter: false },
  { id: "deribit", label: "Deribit", hasAdapter: false },
];

const SERVER_IP = "161.35.94.191";

const NEEDS_PASSPHRASE = new Set(["okx", "kucoin", "bitget"]);

export const ConnectApiModal = ({ open, onClose, onSave, onTest, editMode }: Props) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedExchange, setSelectedExchange] = useState<ExchangeOption | null>(null);
  const [accountName, setAccountName] = useState("Main");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [testnet, setTestnet] = useState(false);
  const [testStatus, setTestStatus] = useState<"IDLE" | "TESTING" | "OK" | "FAIL">("IDLE");
  const [testError, setTestError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editMode) {
      const found = SUPPORTED_EXCHANGES.find((e) => e.id === editMode.exchangeId);
      setSelectedExchange(found ?? { id: editMode.exchangeId, label: editMode.exchangeId, hasAdapter: ADAPTER_IDS.has(editMode.exchangeId) });
      setAccountName(editMode.accountName || "Main");
      setStep(2);
    } else {
      setSelectedExchange(null);
      setAccountName("Main");
      setStep(1);
    }
    setApiKey("");
    setApiSecret("");
    setPassphrase("");
    setTestnet(false);
    setTestStatus("IDLE");
    setTestError("");
    setSubmitError("");
    setCopied(false);
    setSubmitting(false);
  }, [open, editMode]);

  const ready = useMemo(
    () => apiKey.trim().length > 5 && apiSecret.trim().length > 5 && accountName.trim().length > 0,
    [apiKey, apiSecret, accountName],
  );

  const handleSelectExchange = (ex: ExchangeOption) => {
    if (!ex.hasAdapter) return;
    setSelectedExchange(ex);
    setStep(2);
    setTestStatus("IDLE");
    setTestError("");
    setSubmitError("");
  };

  const handleChangeExchange = () => {
    setStep(1);
    setTestStatus("IDLE");
    setTestError("");
    setSubmitError("");
  };

  const handleTest = async () => {
    if (!selectedExchange || !ready) return;
    setTestStatus("TESTING");
    setTestError("");
    try {
      const res = await onTest({
        exchangeId: selectedExchange.id,
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        passphrase: passphrase.trim() || undefined,
        testnet,
      });
      setTestStatus(res.ok ? "OK" : "FAIL");
      setTestError(res.ok ? "" : res.error ?? "Connection test failed");
    } catch (err) {
      setTestStatus("FAIL");
      setTestError(err instanceof Error ? err.message : "Test failed");
    }
  };

  const handleSave = async () => {
    if (!selectedExchange || !ready) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await onSave({
        exchangeId: selectedExchange.id,
        accountName: accountName.trim(),
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        passphrase: passphrase.trim() || undefined,
        testnet,
      });
      if (!res.ok) {
        setSubmitError(res.error ?? "Save failed");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyIp = () => {
    void navigator.clipboard.writeText(SERVER_IP);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  const showPassphrase = selectedExchange && NEEDS_PASSPHRASE.has(selectedExchange.id);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[var(--panel)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">
            {editMode ? "Edit Exchange API" : "Connect Exchange API"}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-[var(--textMuted)] hover:text-[var(--text)] transition">
            Close
          </button>
        </div>

        {/* Step indicator */}
        <div className="mb-5 flex items-center gap-2 text-xs">
          <span className={`rounded-full border px-2.5 py-0.5 font-medium transition ${step === 1 ? "border-[var(--accent)] text-[var(--accent)]" : "border-white/15 text-[var(--textMuted)]"}`}>
            1 Select Exchange
          </span>
          <span className="text-[var(--textMuted)]">—</span>
          <span className={`rounded-full border px-2.5 py-0.5 font-medium transition ${step === 2 ? "border-[var(--accent)] text-[var(--accent)]" : "border-white/15 text-[var(--textMuted)]"}`}>
            2 API Credentials
          </span>
        </div>

        {/* Step 1: Exchange Selection Grid */}
        {step === 1 && (
          <>
            <p className="mb-3 text-sm text-[var(--text)]">Choose your exchange</p>
            <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {SUPPORTED_EXCHANGES.map((ex) => {
                const branding = getExchangeBranding(ex.id);
                return (
                  <button
                    type="button"
                    key={ex.id}
                    onClick={() => handleSelectExchange(ex)}
                    disabled={!ex.hasAdapter}
                    className={`group relative flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                      ex.hasAdapter
                        ? "border-[var(--borderSoft)] bg-[var(--panelMuted)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                        : "border-[var(--borderSoft)] bg-[var(--panelMuted)] opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <img
                      src={branding.iconUrl}
                      alt={ex.label}
                      className={`h-9 w-9 rounded-lg border border-white/10 bg-[var(--panel)] object-cover p-0.5 ${!ex.hasAdapter ? "grayscale" : ""}`}
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.onerror = null;
                        target.style.display = "none";
                        const parent = target.parentElement;
                        if (parent) {
                          const fallback = document.createElement("div");
                          fallback.className = "flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[var(--panel)] text-xs font-bold text-[var(--accent)]";
                          fallback.textContent = branding.shortCode;
                          parent.insertBefore(fallback, target);
                        }
                      }}
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold transition ${ex.hasAdapter ? "text-[var(--text)] group-hover:text-[var(--accent)]" : "text-[var(--textMuted)]"}`}>{ex.label}</p>
                      {!ex.hasAdapter && (
                        <span className="text-[10px] text-[var(--textMuted)]">Coming Soon</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Step 2: API Form */}
        {step === 2 && selectedExchange && (
          <>
            {/* Selected exchange header */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3">
              <img
                src={getExchangeBranding(selectedExchange.id).iconUrl}
                alt={selectedExchange.label}
                className="h-8 w-8 rounded-lg border border-white/10 bg-[var(--panel)] object-cover p-0.5"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--text)]">{selectedExchange.label}</p>
                <p className="text-[11px] text-[var(--textMuted)]">Enter your API credentials below</p>
              </div>
              {!editMode && (
                <button
                  type="button"
                  onClick={handleChangeExchange}
                  className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-[var(--textMuted)] hover:text-[var(--accent)] transition"
                >
                  Change
                </button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-[var(--textMuted)]">
                Account Name
                <input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Main / Scalping-01 / Test"
                  className="mt-1 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/60 transition"
                />
              </label>
              <label className="flex items-end gap-3 text-xs text-[var(--textMuted)] pb-0.5">
                <span className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--accent)]"
                    checked={testnet}
                    onChange={(e) => setTestnet(e.target.checked)}
                  />
                  <span className="text-sm text-[var(--text)]">Testnet</span>
                </span>
                <span className="text-[10px] text-[var(--textMuted)]">Use testnet/sandbox environment</span>
              </label>
              <label className="text-xs text-[var(--textMuted)] md:col-span-2">
                API Key
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/60 transition"
                />
              </label>
              <label className="text-xs text-[var(--textMuted)] md:col-span-2">
                API Secret
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  className="mt-1 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/60 transition"
                />
              </label>
              {showPassphrase && (
                <label className="text-xs text-[var(--textMuted)] md:col-span-2">
                  Passphrase
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder="Required for this exchange"
                    className="mt-1 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/60 transition"
                  />
                </label>
              )}
              {!showPassphrase && (
                <label className="text-xs text-[var(--textMuted)] md:col-span-2">
                  Passphrase <span className="text-[var(--textMuted)]">(optional)</span>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoComplete="new-password"
                    spellCheck={false}
                    className="mt-1 w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/60 transition"
                  />
                </label>
              )}
            </div>

            {/* IP Whitelist */}
            <div className="mt-4 rounded-xl border border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-3 text-xs">
              <p className="mb-1.5 font-semibold text-[var(--accent)]">IP Whitelist Required</p>
              <p className="mb-2 text-[var(--textMuted)]">Add this server IP to your exchange API whitelist before connecting:</p>
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-black/30 px-3 py-1.5 font-mono text-sm text-[var(--text)] select-all">{SERVER_IP}</code>
                <button
                  type="button"
                  onClick={handleCopyIp}
                  className="rounded-lg border border-white/10 bg-[var(--panel)] px-2.5 py-1 text-[11px] text-[var(--textMuted)] hover:text-[var(--text)] transition"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Permissions reminder */}
            <div className="mt-3 rounded-xl border border-[var(--borderSoft)] bg-[var(--panelMuted)] p-3 text-xs text-[var(--textMuted)]">
              <p className="mb-1 font-semibold text-[var(--text)]">API Permissions</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-[#8fc9ab]">Read-only: enabled</span>
                <span className="text-[#8fc9ab]">Spot/Futures trade: as needed</span>
                <span className="text-[#d49f9a]">Withdrawal: disabled</span>
              </div>
            </div>

            {/* Error messages */}
            {submitError && (
              <p className="mt-3 rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">{submitError}</p>
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                {testStatus === "OK" && (
                  <span className="rounded-full border border-[#6f765f] bg-[#1f251b] px-2.5 py-0.5 text-[#d8decf] font-medium">Connection OK</span>
                )}
                {testStatus === "FAIL" && (
                  <span className="rounded-full border border-[#704844] bg-[#271a19] px-2.5 py-0.5 text-[#d6b3af]">Failed: {testError}</span>
                )}
                {testStatus === "TESTING" && (
                  <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[var(--textMuted)] animate-pulse">Testing...</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => (editMode ? onClose() : handleChangeExchange())}
                  className="rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-1.5 text-xs text-[var(--textMuted)] hover:opacity-90 transition"
                >
                  {editMode ? "Cancel" : "Back"}
                </button>
                <button
                  type="button"
                  disabled={!ready || testStatus === "TESTING"}
                  onClick={handleTest}
                  className="rounded-lg border border-white/15 bg-[var(--panelMuted)] px-3 py-1.5 text-xs text-[var(--text)] disabled:opacity-40 hover:opacity-90 transition"
                >
                  Test Connection
                </button>
                <button
                  type="button"
                  disabled={!ready || submitting}
                  onClick={handleSave}
                  className="rounded-lg border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-4 py-1.5 text-xs font-semibold text-[var(--accent)] disabled:opacity-40 hover:opacity-90 transition"
                >
                  {submitting ? "Connecting..." : "Save & Connect"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
