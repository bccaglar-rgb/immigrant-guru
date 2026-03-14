import type { FieldMapping, ProviderConfig } from "../types";

interface Props {
  mappings: FieldMapping[];
  providers: ProviderConfig[];
  onChange: (fieldKey: string, patch: Partial<FieldMapping>) => void;
}

export const MappingEditor = ({ mappings, providers, onChange }: Props) => (
  <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
    <h2 className="mb-3 text-sm font-semibold text-white">Feature Mapping</h2>
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr className="border-b border-white/10 bg-[#0F1012]">
            {["Field", "Provider", "Endpoint Path", "Parse Rule", "Refresh (s)", "Enabled"].map((head) => (
              <th key={head} className="px-2 py-2 text-left text-[11px] uppercase tracking-wider text-[#6B6F76]">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mappings.map((mapping) => (
            <tr key={mapping.fieldKey} className="border-b border-white/5 text-xs text-[#BFC2C7] hover:bg-[#17191d]">
              <td className="px-2 py-2 font-medium text-white">{mapping.fieldKey}</td>
              <td className="px-2 py-2">
                <select
                  className="w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-xs"
                  value={mapping.providerId}
                  onChange={(e) => onChange(mapping.fieldKey, { providerId: e.target.value })}
                >
                  <option value="">Select provider</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-2">
                <input
                  className="w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-xs"
                  value={mapping.endpointPath}
                  placeholder="/v1/market"
                  onChange={(e) => onChange(mapping.fieldKey, { endpointPath: e.target.value })}
                />
              </td>
              <td className="px-2 py-2">
                <input
                  className="w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-xs"
                  value={mapping.parseRule}
                  placeholder="$.data.price"
                  onChange={(e) => onChange(mapping.fieldKey, { parseRule: e.target.value })}
                />
              </td>
              <td className="px-2 py-2">
                <input
                  type="number"
                  min={1}
                  className="w-24 rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-xs"
                  value={mapping.refreshSec}
                  onChange={(e) => onChange(mapping.fieldKey, { refreshSec: Math.max(1, Number(e.target.value) || 1) })}
                />
              </td>
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#F5C542]"
                  checked={mapping.enabled}
                  onChange={(e) => onChange(mapping.fieldKey, { enabled: e.target.checked })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);
