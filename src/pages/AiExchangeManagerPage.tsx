import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AiModelConfig, ExchangeConfig } from "../types";

type TabKey = "models" | "exchanges";

const MODELS_KEY = "admin-ai-models-v1";
const EXCHANGES_KEY = "admin-exchanges-v1";

const tabBtn = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold transition ${
    active ? "border-[#F5C542]/70 bg-[#2b2417] text-[#F5C542]" : "border-white/15 bg-[#111215] text-[#BFC2C7] hover:bg-[#17191d]"
  }`;

const inputCls =
  "w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none placeholder:text-[#6B6F76] focus:border-[#F5C542]/50";
const labelCls = "text-xs font-medium text-[#BFC2C7]";
const nowIso = () => new Date().toISOString();
const id = () => Math.random().toString(36).slice(2, 10);

const mask = (value?: string) => {
  if (!value) return "-";
  if (value.length <= 6) return "*".repeat(value.length);
  return `${value.slice(0, 3)}${"*".repeat(Math.max(4, value.length - 6))}${value.slice(-3)}`;
};

const isValidUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const defaultModelForm = { name: "", type: "Hosted" as "Hosted" | "Local", endpoint: "", apiKey: "", enabled: true, priority: 1, notes: "" };
const defaultExchangeForm = { name: "", type: "Both" as "Spot" | "Futures" | "Both", apiKey: "", apiSecret: "", passphrase: "", testnet: true, enabled: true };
const EXCHANGE_PRESETS = ["Binance", "Bybit", "OKX", "Gate.io", "KuCoin", "Kraken"] as const;

export const AiExchangeManagerContent = ({ embedded = false }: { embedded?: boolean }) => {
  const [tab, setTab] = useState<TabKey>("models");
  const [modelsOpen, setModelsOpen] = useState(false);
  const [exchangesOpen, setExchangesOpen] = useState(false);
  const [models, setModels] = useState<AiModelConfig[]>([]);
  const [exchanges, setExchanges] = useState<ExchangeConfig[]>([]);
  const [modelForm, setModelForm] = useState(defaultModelForm);
  const [exchangeForm, setExchangeForm] = useState(defaultExchangeForm);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editingExchangeId, setEditingExchangeId] = useState<string | null>(null);
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({});
  const [exchangeErrors, setExchangeErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const m = window.localStorage.getItem(MODELS_KEY);
      const e = window.localStorage.getItem(EXCHANGES_KEY);
      if (m) setModels(JSON.parse(m));
      if (e) setExchanges(JSON.parse(e));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => window.localStorage.setItem(MODELS_KEY, JSON.stringify(models)), [models]);
  useEffect(() => {
    window.localStorage.setItem(EXCHANGES_KEY, JSON.stringify(exchanges));
    window.dispatchEvent(new Event("admin-config-updated"));
  }, [exchanges]);

  const modelValidation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!modelForm.name.trim()) errors.name = "Model name is required.";
    if (modelForm.type === "Hosted" && modelForm.endpoint && !isValidUrl(modelForm.endpoint)) errors.endpoint = "Endpoint must be a valid URL.";
    if (!Number.isFinite(modelForm.priority) || modelForm.priority < 0) errors.priority = "Priority must be >= 0.";
    return errors;
  }, [modelForm]);

  const exchangeValidation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!exchangeForm.name.trim()) errors.name = "Exchange name is required.";
    return errors;
  }, [exchangeForm]);

  const handleModelSubmit = (e: FormEvent) => {
    e.preventDefault();
    setModelErrors(modelValidation);
    if (Object.keys(modelValidation).length) return;
    if (editingModelId) {
      setModels((prev) => prev.map((item) => (item.id === editingModelId ? { ...item, ...modelForm, updatedAt: nowIso() } : item)));
    } else {
      const next: AiModelConfig = {
        id: id(),
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
    setEditingModelId(null);
    setModelForm(defaultModelForm);
    setModelErrors({});
  };

  const handleExchangeSubmit = (e: FormEvent) => {
    e.preventDefault();
    setExchangeErrors(exchangeValidation);
    if (Object.keys(exchangeValidation).length) return;
    if (editingExchangeId) {
      setExchanges((prev) => prev.map((item) => (item.id === editingExchangeId ? { ...item, ...exchangeForm, updatedAt: nowIso() } : item)));
    } else {
      const next: ExchangeConfig = {
        id: id(),
        name: exchangeForm.name.trim(),
        type: exchangeForm.type,
        apiKey: exchangeForm.apiKey.trim() || undefined,
        apiSecret: exchangeForm.apiSecret.trim() || undefined,
        passphrase: exchangeForm.passphrase.trim() || undefined,
        testnet: exchangeForm.testnet,
        enabled: exchangeForm.enabled,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      setExchanges((prev) => [next, ...prev]);
    }
    setEditingExchangeId(null);
    setExchangeForm(defaultExchangeForm);
    setExchangeErrors({});
  };

  const modelsSection = (
    <section className="grid gap-4 xl:grid-cols-[390px_1fr]">
      <form onSubmit={handleModelSubmit} className="rounded-2xl border border-white/10 bg-[#121316] p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">{editingModelId ? "Update AI Model" : "Add AI Model"}</h2>
        <div className="space-y-3">
          <label className={labelCls}>Name<input className={inputCls} value={modelForm.name} onChange={(e) => setModelForm((p) => ({ ...p, name: e.target.value }))} />{modelErrors.name ? <span className="mt-1 block text-[11px] text-[#d6b3af]">{modelErrors.name}</span> : null}</label>
          <label className={labelCls}>Type<select className={inputCls} value={modelForm.type} onChange={(e) => setModelForm((p) => ({ ...p, type: e.target.value as "Hosted" | "Local" }))}><option value="Hosted">Hosted</option><option value="Local">Local</option></select></label>
          <label className={labelCls}>Endpoint (optional)<input className={inputCls} value={modelForm.endpoint} onChange={(e) => setModelForm((p) => ({ ...p, endpoint: e.target.value }))} />{modelErrors.endpoint ? <span className="mt-1 block text-[11px] text-[#d6b3af]">{modelErrors.endpoint}</span> : null}</label>
          <label className={labelCls}>API Key (optional)<input type="password" className={inputCls} value={modelForm.apiKey} onChange={(e) => setModelForm((p) => ({ ...p, apiKey: e.target.value }))} /></label>
          <label className={labelCls}>Priority<input type="number" min={0} className={inputCls} value={modelForm.priority} onChange={(e) => setModelForm((p) => ({ ...p, priority: Number(e.target.value) }))} /></label>
          <label className={labelCls}>Notes<textarea className={`${inputCls} min-h-20`} value={modelForm.notes} onChange={(e) => setModelForm((p) => ({ ...p, notes: e.target.value }))} /></label>
          <label className="flex items-center gap-2 text-xs text-[#BFC2C7]"><input type="checkbox" className="h-4 w-4 accent-[#F5C542]" checked={modelForm.enabled} onChange={(e) => setModelForm((p) => ({ ...p, enabled: e.target.checked }))} />Enabled</label>
          <div className="flex gap-2"><button type="submit" className="rounded-lg border border-[#F5C542]/50 bg-[#2b2417] px-3 py-2 text-xs font-semibold text-[#F5C542]">{editingModelId ? "Update" : "Add"}</button><button type="button" className="rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-xs text-[#BFC2C7]" onClick={() => { setEditingModelId(null); setModelForm(defaultModelForm); }}>Reset</button></div>
        </div>
      </form>

      <div className="rounded-2xl border border-white/10 bg-[#121316] p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Configured AI Models</h2>
        <div className="space-y-2">
          {models.length ? models.map((model) => (
            <article key={model.id} className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-white">{model.name}</p>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-[#BFC2C7]">{model.type}</span>
              </div>
              <p className="mt-1 text-xs text-[#6B6F76]">Endpoint: {model.endpoint ?? "-"}</p>
              <p className="text-xs text-[#6B6F76]">API Key: {mask(model.apiKey)}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="rounded border border-white/15 bg-[#111215] px-2 py-1 text-[11px] text-[#BFC2C7]" onClick={() => { setEditingModelId(model.id); setModelForm({ name: model.name, type: model.type, endpoint: model.endpoint ?? "", apiKey: model.apiKey ?? "", enabled: model.enabled, priority: model.priority, notes: model.notes ?? "" }); }}>Edit</button>
                <button type="button" className="rounded border border-white/15 bg-[#111215] px-2 py-1 text-[11px] text-[#BFC2C7]" onClick={() => setModels((prev) => prev.map((item) => item.id === model.id ? { ...item, enabled: !item.enabled, updatedAt: nowIso() } : item))}>{model.enabled ? "Disable" : "Enable"}</button>
                <button type="button" className="rounded border border-[#704844] bg-[#271a19] px-2 py-1 text-[11px] text-[#d6b3af]" onClick={() => setModels((prev) => prev.filter((item) => item.id !== model.id))}>Delete</button>
              </div>
            </article>
          )) : <p className="text-sm text-[#6B6F76]">No AI model configured yet.</p>}
        </div>
      </div>
    </section>
  );

  const exchangesSection = (
    <section className="grid gap-4 xl:grid-cols-[390px_1fr]">
      <form onSubmit={handleExchangeSubmit} className="rounded-2xl border border-white/10 bg-[#121316] p-4">
        <h2 className="mb-1 text-sm font-semibold text-white">{editingExchangeId ? "Update Exchange API" : "Add Exchange API"}</h2>
        <p className="mb-3 text-[11px] text-[#6B6F76]">API entry / edit / cancel</p>
        <div className="space-y-3">
          <label className={labelCls}>
            Exchange Preset
            <select
              className={inputCls}
              value={exchangeForm.name}
              onChange={(e) => {
                const preset = e.target.value;
                setExchangeForm((p) => ({ ...p, name: preset }));
              }}
            >
              <option value="">Select exchange...</option>
              {EXCHANGE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>Exchange Name<input className={inputCls} value={exchangeForm.name} onChange={(e) => setExchangeForm((p) => ({ ...p, name: e.target.value }))} />{exchangeErrors.name ? <span className="mt-1 block text-[11px] text-[#d6b3af]">{exchangeErrors.name}</span> : null}</label>
          <label className={labelCls}>Type<select className={inputCls} value={exchangeForm.type} onChange={(e) => setExchangeForm((p) => ({ ...p, type: e.target.value as "Spot" | "Futures" | "Both" }))}><option value="Spot">Spot</option><option value="Futures">Futures</option><option value="Both">Both</option></select></label>
          <label className={labelCls}>API Key<input type="password" className={inputCls} value={exchangeForm.apiKey} onChange={(e) => setExchangeForm((p) => ({ ...p, apiKey: e.target.value }))} /></label>
          <label className={labelCls}>API Secret<input type="password" className={inputCls} value={exchangeForm.apiSecret} onChange={(e) => setExchangeForm((p) => ({ ...p, apiSecret: e.target.value }))} /></label>
          <label className={labelCls}>Passphrase<input type="password" className={inputCls} value={exchangeForm.passphrase} onChange={(e) => setExchangeForm((p) => ({ ...p, passphrase: e.target.value }))} /></label>
          <label className="flex items-center gap-2 text-xs text-[#BFC2C7]"><input type="checkbox" className="h-4 w-4 accent-[#F5C542]" checked={exchangeForm.testnet} onChange={(e) => setExchangeForm((p) => ({ ...p, testnet: e.target.checked }))} />Testnet</label>
          <label className="flex items-center gap-2 text-xs text-[#BFC2C7]"><input type="checkbox" className="h-4 w-4 accent-[#F5C542]" checked={exchangeForm.enabled} onChange={(e) => setExchangeForm((p) => ({ ...p, enabled: e.target.checked }))} />Enabled</label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg border border-[#F5C542]/50 bg-[#2b2417] px-3 py-2 text-xs font-semibold text-[#F5C542]">
              {editingExchangeId ? "Save Changes" : "Add Exchange"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-xs text-[#BFC2C7]"
              onClick={() => {
                setEditingExchangeId(null);
                setExchangeForm(defaultExchangeForm);
              }}
            >
              {editingExchangeId ? "Cancel Edit" : "Clear"}
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-2xl border border-white/10 bg-[#121316] p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Configured Exchanges</h2>
        <div className="space-y-2">
          {exchanges.length ? exchanges.map((exchange) => (
            <article key={exchange.id} className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-white">{exchange.name}</p><span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-[#BFC2C7]">{exchange.type}</span></div>
              <p className="mt-1 text-xs text-[#6B6F76]">API Key: {mask(exchange.apiKey)}</p>
              <p className="text-xs text-[#6B6F76]">API Secret: {mask(exchange.apiSecret)}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="rounded border border-white/15 bg-[#111215] px-2 py-1 text-[11px] text-[#BFC2C7]" onClick={() => { setEditingExchangeId(exchange.id); setExchangeForm({ name: exchange.name, type: exchange.type, apiKey: exchange.apiKey ?? "", apiSecret: exchange.apiSecret ?? "", passphrase: exchange.passphrase ?? "", testnet: exchange.testnet, enabled: exchange.enabled }); }}>Edit</button>
                <button type="button" className="rounded border border-white/15 bg-[#111215] px-2 py-1 text-[11px] text-[#BFC2C7]" onClick={() => setExchanges((prev) => prev.map((item) => item.id === exchange.id ? { ...item, enabled: !item.enabled, updatedAt: nowIso() } : item))}>{exchange.enabled ? "Disable" : "Enable"}</button>
                <button type="button" className="rounded border border-[#704844] bg-[#271a19] px-2 py-1 text-[11px] text-[#d6b3af]" onClick={() => setExchanges((prev) => prev.filter((item) => item.id !== exchange.id))}>Delete</button>
              </div>
            </article>
          )) : <p className="text-sm text-[#6B6F76]">No exchange configured yet.</p>}
        </div>
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      {!embedded ? (
        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <h1 className="text-lg font-semibold text-white">AI Exchange Manager</h1>
          <p className="text-xs text-[#6B6F76]">Manage model routing and exchange connectivity.</p>
        </section>
      ) : null}

      {!embedded ? (
        <>
          <div className="flex gap-2">
            <button type="button" className={tabBtn(tab === "models")} onClick={() => setTab("models")}>AI Models</button>
            <button type="button" className={tabBtn(tab === "exchanges")} onClick={() => setTab("exchanges")}>Exchanges</button>
          </div>
          {tab === "models" ? modelsSection : exchangesSection}
        </>
      ) : (
        <div className="space-y-3">
          <section className="rounded-xl border border-white/10 bg-[#0F1012]">
            <button type="button" onClick={() => setModelsOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white">
              <span>AI Models</span>
              <span className={`text-xs text-[#BFC2C7] transition-transform ${modelsOpen ? "rotate-180" : ""}`}>⌄</span>
            </button>
            <div className={`grid overflow-hidden border-t border-white/10 transition-[grid-template-rows] duration-300 ${modelsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="min-h-0 p-2">{modelsSection}</div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-[#0F1012]">
            <button type="button" onClick={() => setExchangesOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white">
              <span>Exchanges</span>
              <span className={`text-xs text-[#BFC2C7] transition-transform ${exchangesOpen ? "rotate-180" : ""}`}>⌄</span>
            </button>
            <div className={`grid overflow-hidden border-t border-white/10 transition-[grid-template-rows] duration-300 ${exchangesOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="min-h-0 p-2">{exchangesSection}</div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default function AiExchangeManagerPage() {
  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px]">
        <AiExchangeManagerContent />
      </div>
    </main>
  );
}
