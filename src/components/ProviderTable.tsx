import { useState } from "react";
import type { ProviderConfig } from "../types";

interface Props {
  providers: ProviderConfig[];
  orderedPriorityIds: string[];
  onAdd: () => void;
  onEdit: (provider: ProviderConfig) => void;
  onDelete: (provider: ProviderConfig) => void;
  onToggleEnabled: (provider: ProviderConfig) => void;
  onTestConnection: (provider: ProviderConfig) => void;
  onMovePriority: (providerId: string, direction: "up" | "down") => void;
  onPinPriorityTop: (providerId: string) => void;
}

const mask = (value?: string, reveal = false) => {
  if (!value) return "-";
  if (reveal) return value;
  if (value.length <= 6) return "*".repeat(value.length);
  return `${value.slice(0, 3)}${"*".repeat(Math.max(4, value.length - 6))}${value.slice(-3)}`;
};

const statusTone = (status: ProviderConfig["lastTestStatus"]) => {
  if (status === "OK") return "border-[#6f765f] bg-[#1f251b] text-[#d8decf]";
  if (status === "FAIL") return "border-[#704844] bg-[#271a19] text-[#d6b3af]";
  return "border-white/10 bg-[#1A1B1F] text-[#BFC2C7]";
};

export const ProviderTable = ({
  providers,
  orderedPriorityIds,
  onAdd,
  onEdit,
  onDelete,
  onToggleEnabled,
  onTestConnection,
  onMovePriority,
  onPinPriorityTop,
}: Props) => {
  const [revealedId, setRevealedId] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">API Providers</h2>
        <button type="button" onClick={onAdd} className="rounded-lg border border-[#F5C542]/60 bg-[#2b2417] px-3 py-2 text-xs font-semibold text-[#F5C542]">
          Add Provider
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-[#0F1012]">
              {["Name", "Group", "Type", "REST Base", "WS Base", "Priority", "API Key", "Secret", "Enabled", "Status", "Actions"].map((head) => (
                <th key={head} className="px-2 py-2 text-left text-[11px] uppercase tracking-wider text-[#6B6F76]">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => {
              const revealed = revealedId === provider.id;
              const priorityIdx = orderedPriorityIds.indexOf(provider.id);
              const isFallbackOrdered = priorityIdx >= 0;
              return (
                <tr key={provider.id} className="border-b border-white/5 text-xs text-[#BFC2C7] hover:bg-[#17191d]">
                  <td className="px-2 py-2">
                    <p className="font-semibold text-white">{provider.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {provider.defaultPrimary ? (
                        <span className="rounded-full border border-[#7d6a2e] bg-[#2d2614] px-1.5 py-0.5 text-[10px] text-[#f5c542]">Default</span>
                      ) : null}
                      {provider.exchangeName ? (
                        <span className="rounded-full border border-white/15 bg-[#15171b] px-1.5 py-0.5 text-[10px] text-[#cdd2dc]">{provider.exchangeName}</span>
                      ) : null}
                    </div>
                    {provider.notes ? <p className="mt-1 text-[11px] text-[#6B6F76]">{provider.notes}</p> : null}
                  </td>
                  <td className="px-2 py-2">{provider.providerGroup ?? "-"}</td>
                  <td className="px-2 py-2">{provider.type}</td>
                  <td className="px-2 py-2">{provider.baseUrl}</td>
                  <td className="px-2 py-2">{provider.wsUrl ?? "-"}</td>
                  <td className="px-2 py-2">
                    {isFallbackOrdered ? (
                      <span className="rounded-md border border-white/15 bg-[#14171c] px-2 py-0.5 text-[10px] text-[#d8dbe1]">
                        {priorityIdx + 1}/{orderedPriorityIds.length}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-2 py-2">{mask(provider.apiKey, revealed)}</td>
                  <td className="px-2 py-2">{mask(provider.apiSecret, revealed)}</td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onToggleEnabled(provider)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${provider.enabled ? "border-[#6f765f] bg-[#1f251b] text-[#d8decf]" : "border-white/10 bg-[#1A1B1F] text-[#6B6F76]"}`}
                    >
                      {provider.enabled ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(provider.lastTestStatus ?? "UNKNOWN")}`}>
                      {provider.lastTestStatus ?? "UNKNOWN"}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => onTestConnection(provider)} className="rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px]">
                        Test
                      </button>
                      {isFallbackOrdered ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onMovePriority(provider.id, "up")}
                            disabled={priorityIdx === 0}
                            className="rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px] disabled:opacity-35"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => onMovePriority(provider.id, "down")}
                            disabled={priorityIdx === orderedPriorityIds.length - 1}
                            className="rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px] disabled:opacity-35"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => onPinPriorityTop(provider.id)}
                            disabled={priorityIdx === 0}
                            className="rounded border border-[#7a6840] bg-[#2a2418] px-2 py-1 text-[11px] text-[#F5C542] disabled:opacity-35"
                            title="Pin to top (default)"
                          >
                            Top
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setRevealedId(provider.id);
                          window.setTimeout(() => setRevealedId((current) => (current === provider.id ? null : current)), 5000);
                        }}
                        className="rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px]"
                      >
                        Show
                      </button>
                      <button type="button" onClick={() => onEdit(provider)} className="rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-[11px]">
                        Edit
                      </button>
                      <button type="button" onClick={() => onDelete(provider)} className="rounded border border-[#704844] bg-[#271a19] px-2 py-1 text-[11px] text-[#d6b3af]">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!providers.length ? <p className="mt-2 text-xs text-[#6B6F76]">No providers configured.</p> : null}
    </section>
  );
};
