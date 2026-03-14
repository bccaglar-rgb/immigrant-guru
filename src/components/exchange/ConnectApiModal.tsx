import { useEffect, useMemo, useState } from "react";
import type { AccountMode, ExchangeConnectionInput, ExchangeName } from "../../types/exchange";

interface Props {
  open: boolean;
  selectedExchange: ExchangeName;
  selectedMode: AccountMode;
  onClose: () => void;
  onSaveAndConnect: (payload: ExchangeConnectionInput) => Promise<{ ok: boolean; error?: string }>;
  onTestConnection: (payload: { baseUrl: string; apiKey: string; apiSecret: string }) => Promise<{ ok: boolean; error?: string }>;
}

const inputCls = "w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1.5 text-sm text-[#E7E9ED] outline-none focus:border-[#F5C542]/60";

export const ConnectApiModal = ({ open, selectedExchange, selectedMode, onClose, onSaveAndConnect, onTestConnection }: Props) => {
  const [exchange, setExchange] = useState<ExchangeName>(selectedExchange);
  const [accountMode, setAccountMode] = useState<AccountMode>(selectedMode);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [testnet, setTestnet] = useState(true);
  const [testStatus, setTestStatus] = useState<"IDLE" | "OK" | "FAIL">("IDLE");
  const [testError, setTestError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setExchange(selectedExchange);
    setAccountMode(selectedMode);
  }, [open, selectedExchange, selectedMode]);

  const ready = useMemo(() => apiKey.trim().length > 5 && apiSecret.trim().length > 5, [apiKey, apiSecret]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#121316] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Connect API</h3>
          <button type="button" onClick={onClose} className="rounded border border-white/10 px-2 py-1 text-xs text-[#BFC2C7]">Close</button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-[#BFC2C7]">Exchange
            <select className={inputCls} value={exchange} onChange={(e) => setExchange(e.target.value as ExchangeName)}>
              <option value="Binance">Binance</option>
              <option value="Bybit">Bybit</option>
              <option value="OKX">OKX</option>
            </select>
          </label>
          <label className="text-xs text-[#BFC2C7]">Account type
            <select className={inputCls} value={accountMode} onChange={(e) => setAccountMode(e.target.value as AccountMode)}>
              <option value="Spot">Spot</option>
              <option value="Futures">Futures</option>
              <option value="Both">Both</option>
            </select>
          </label>
          <label className="text-xs text-[#BFC2C7] md:col-span-2">API Key
            <input className={inputCls} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </label>
          <label className="text-xs text-[#BFC2C7] md:col-span-2">API Secret
            <input className={inputCls} type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
          </label>
          <label className="text-xs text-[#BFC2C7] md:col-span-2">Passphrase (optional)
            <input className={inputCls} type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </label>
        </div>

        <div className="mt-3 rounded-lg border border-white/10 bg-[#0F1012] p-2 text-xs text-[#BFC2C7]">
          <p className="font-semibold text-white">Permissions checklist</p>
          <p>- Read-only enabled</p>
          <p>- Spot/Futures trade enabled as needed</p>
          <p>- Withdrawal disabled</p>
          <label className="mt-2 inline-flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[#F5C542]" checked={testnet} onChange={(e) => setTestnet(e.target.checked)} />
            Testnet
          </label>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs">
            {testStatus === "OK" ? <span className="rounded-full border border-[#6f765f] bg-[#1f251b] px-2 py-0.5 text-[#d8decf]">OK</span> : null}
            {testStatus === "FAIL" ? <span className="rounded-full border border-[#704844] bg-[#271a19] px-2 py-0.5 text-[#d6b3af]">FAIL: {testError}</span> : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!ready}
              onClick={async () => {
                const baseUrl = exchange === "Binance" ? "https://api.binance.com" : exchange === "Bybit" ? "https://api.bybit.com" : "https://www.okx.com";
                const res = await onTestConnection({ baseUrl, apiKey, apiSecret });
                setTestStatus(res.ok ? "OK" : "FAIL");
                setTestError(res.ok ? "" : res.error ?? "Connection test failed");
              }}
              className="rounded border border-white/15 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7] disabled:opacity-40"
            >
              Test Connection
            </button>
            <button
              type="button"
              disabled={!ready || submitting}
              onClick={async () => {
                setSubmitting(true);
                const result = await onSaveAndConnect({
                  exchange,
                  accountMode,
                  apiKey,
                  apiSecret,
                  passphrase: passphrase || undefined,
                  testnet,
                });
                setSubmitting(false);
                if (!result.ok) {
                  setTestStatus("FAIL");
                  setTestError(result.error ?? "Save failed");
                }
              }}
              className="rounded border border-[#F5C542]/60 bg-[#2b2417] px-3 py-1.5 text-xs font-semibold text-[#F5C542] disabled:opacity-40"
            >
              {submitting ? "Connecting..." : "Save & Connect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
