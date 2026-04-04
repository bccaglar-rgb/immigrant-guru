"use client";

import { cn } from "@/lib/utils";
import type { CaseWorkspaceTabId } from "@/types/case-workspace";

type CaseWorkspaceTabsProps = Readonly<{
  activeTab: CaseWorkspaceTabId;
  onChange: (tab: CaseWorkspaceTabId) => void;
  tabs: Array<{
    id: CaseWorkspaceTabId;
    label: string;
  }>;
}>;

export function CaseWorkspaceTabs({
  activeTab,
  onChange,
  tabs
}: CaseWorkspaceTabsProps) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-full gap-2 rounded-[24px] border border-white/80 bg-white/75 p-2 shadow-[0_12px_40px_rgba(15,23,42,0.05)] backdrop-blur">
        {tabs.map((tab) => (
          <button
            className={cn(
              "inline-flex flex-1 items-center justify-center rounded-[18px] px-4 py-3 text-sm font-semibold transition-colors duration-200",
              activeTab === tab.id
                ? "bg-slate-950 text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)]"
                : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-950"
            )}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
