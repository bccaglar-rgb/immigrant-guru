import { useEffect, useState, type FormEvent } from "react";
import type { ProviderConfig } from "../types";

interface Props {
  open: boolean;
  initial?: ProviderConfig | null;
  onClose: () => void;
  onSave: (provider: ProviderConfig) => void;
}

const inputCls =
  "w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none placeholder:text-[#6B6F76] focus:border-[#F5C542]/50";

const isValidUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
};

const uid = () => Math.random().toString(36).slice(2, 10);

const emptyForm = {
  name: "",
  providerGroup: "OUTSOURCE" as "OUTSOURCE" | "EXCHANGE",
  exchangeName: "",
  type: "REST" as ProviderConfig["type"],
  baseUrl: "",
  wsUrl: "",
  discoveryEndpoint: "",
  fallbackPriority: 0,
  defaultPrimary: false,
  apiKey: "",
  apiSecret: "",
  passphrase: "",
  enabled: true,
  notes: "",
};

export const ProviderFormModal = ({ open, initial, onClose, onSave }: Props) => {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name,
        providerGroup: initial.providerGroup ?? "OUTSOURCE",
        exchangeName: initial.exchangeName ?? "",
        type: initial.type,
        baseUrl: initial.baseUrl,
        wsUrl: initial.wsUrl ?? "",
        discoveryEndpoint: initial.discoveryEndpoint ?? "",
        fallbackPriority: Number(initial.fallbackPriority ?? 0),
        defaultPrimary: Boolean(initial.defaultPrimary),
        apiKey: initial.apiKey ?? "",
        apiSecret: initial.apiSecret ?? "",
        passphrase: initial.passphrase ?? "",
        enabled: initial.enabled,
        notes: initial.notes ?? "",
      });
      return;
    }
    setForm(emptyForm);
    setErrors({});
  }, [initial, open]);

  if (!open) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "Provider name is required.";
    if (!form.baseUrl.trim()) nextErrors.baseUrl = "Base URL is required.";
    if (form.baseUrl.trim() && !isValidUrl(form.baseUrl.trim())) nextErrors.baseUrl = "Base URL must be valid.";
    if (form.wsUrl.trim() && !isValidUrl(form.wsUrl.trim())) nextErrors.wsUrl = "WebSocket URL must be valid.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const now = new Date().toISOString();
    const provider: ProviderConfig = {
      id: initial?.id ?? uid(),
      presetKey: initial?.presetKey,
      name: form.name.trim(),
      providerGroup: form.providerGroup,
      exchangeName: form.exchangeName.trim() || undefined,
      type: form.type,
      baseUrl: form.baseUrl.trim(),
      wsUrl: form.wsUrl.trim() || undefined,
      discoveryEndpoint: form.discoveryEndpoint.trim() || undefined,
      fallbackPriority: Number.isFinite(form.fallbackPriority) ? Number(form.fallbackPriority) : undefined,
      defaultPrimary: form.defaultPrimary,
      apiKey: form.apiKey.trim() || undefined,
      apiSecret: form.apiSecret.trim() || undefined,
      passphrase: form.passphrase.trim() || undefined,
      enabled: form.enabled,
      notes: form.notes.trim() || undefined,
      lastTestStatus: initial?.lastTestStatus ?? "UNKNOWN",
      lastTestAt: initial?.lastTestAt ?? now,
    };
    onSave(provider);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#121316] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{initial ? "Edit Provider" : "Add Provider"}</h3>
          <button type="button" onClick={onClose} className="rounded border border-white/10 px-2 py-1 text-xs text-[#BFC2C7]">
            Close
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-[#BFC2C7]">
            Provider Name
            <input className={inputCls} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            {errors.name ? <span className="mt-1 block text-[11px] text-[#d6b3af]">{errors.name}</span> : null}
          </label>
          <label className="text-xs text-[#BFC2C7]">
            Group
            <select
              className={inputCls}
              value={form.providerGroup}
              onChange={(e) => setForm((p) => ({ ...p, providerGroup: e.target.value as "OUTSOURCE" | "EXCHANGE" }))}
            >
              <option value="OUTSOURCE">Outsource API</option>
              <option value="EXCHANGE">Exchange Source</option>
            </select>
          </label>
          <label className="text-xs text-[#BFC2C7]">
            Provider Type
            <select className={inputCls} value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as ProviderConfig["type"] }))}>
              <option value="REST">REST</option>
              <option value="WS">WebSocket</option>
              <option value="BOTH">Both</option>
            </select>
          </label>
          <label className="text-xs text-[#BFC2C7]">
            Exchange Name (optional)
            <input className={inputCls} value={form.exchangeName} onChange={(e) => setForm((p) => ({ ...p, exchangeName: e.target.value }))} placeholder="Binance / Bybit / OKX..." />
          </label>
          <label className="text-xs text-[#BFC2C7] md:col-span-2">
            Base URL
            <input className={inputCls} value={form.baseUrl} onChange={(e) => setForm((p) => ({ ...p, baseUrl: e.target.value }))} placeholder="https://api.provider.com" />
            {errors.baseUrl ? <span className="mt-1 block text-[11px] text-[#d6b3af]">{errors.baseUrl}</span> : null}
          </label>
          <label className="text-xs text-[#BFC2C7] md:col-span-2">
            WebSocket URL (optional)
            <input className={inputCls} value={form.wsUrl} onChange={(e) => setForm((p) => ({ ...p, wsUrl: e.target.value }))} placeholder="wss://stream.provider.com" />
            {errors.wsUrl ? <span className="mt-1 block text-[11px] text-[#d6b3af]">{errors.wsUrl}</span> : null}
          </label>
          <label className="text-xs text-[#BFC2C7] md:col-span-2">
            Discovery / Health Endpoint (optional)
            <input className={inputCls} value={form.discoveryEndpoint} onChange={(e) => setForm((p) => ({ ...p, discoveryEndpoint: e.target.value }))} placeholder="/api/v3/exchangeInfo" />
          </label>
          <label className="text-xs text-[#BFC2C7]">
            Fallback Priority (0 = none)
            <input
              type="number"
              min={0}
              className={inputCls}
              value={form.fallbackPriority}
              onChange={(e) => setForm((p) => ({ ...p, fallbackPriority: Number(e.target.value) || 0 }))}
            />
          </label>
          <label className="col-span-full flex items-center gap-2 text-xs text-[#BFC2C7]">
            <input type="checkbox" className="h-4 w-4 accent-[#F5C542]" checked={form.defaultPrimary} onChange={(e) => setForm((p) => ({ ...p, defaultPrimary: e.target.checked }))} />
            Default Primary Source
          </label>
          <label className="text-xs text-[#BFC2C7]">
            API Key
            <input type="password" className={inputCls} value={form.apiKey} onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))} />
          </label>
          <label className="text-xs text-[#BFC2C7]">
            API Secret (optional)
            <input type="password" className={inputCls} value={form.apiSecret} onChange={(e) => setForm((p) => ({ ...p, apiSecret: e.target.value }))} />
          </label>
          <label className="text-xs text-[#BFC2C7]">
            Passphrase (optional)
            <input type="password" className={inputCls} value={form.passphrase} onChange={(e) => setForm((p) => ({ ...p, passphrase: e.target.value }))} />
          </label>
          <label className="text-xs text-[#BFC2C7]">
            Notes (optional)
            <input className={inputCls} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </label>
          <label className="col-span-full flex items-center gap-2 text-xs text-[#BFC2C7]">
            <input type="checkbox" className="h-4 w-4 accent-[#F5C542]" checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} />
            Enabled
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-xs text-[#BFC2C7]">
            Cancel
          </button>
          <button type="submit" className="rounded-lg border border-[#F5C542]/60 bg-[#2b2417] px-3 py-2 text-xs font-semibold text-[#F5C542]">
            Save Provider
          </button>
        </div>
      </form>
    </div>
  );
};
