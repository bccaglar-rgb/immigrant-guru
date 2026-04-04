import { DashboardCommandCard } from "@/components/dashboard/dashboard-command-card";
import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";

type SignalItem = {
  id: string;
  label: string;
  supportingText: string;
  tone: "neutral" | "warning" | "critical" | "positive" | "accent";
  meta: string;
};

type DashboardSignalListCardProps = Readonly<{
  eyebrow: string;
  emptyCopy: string;
  summary: string;
  title: string;
  items: SignalItem[];
}>;

export function DashboardSignalListCard({
  eyebrow,
  emptyCopy,
  items,
  summary,
  title
}: DashboardSignalListCardProps) {
  return (
    <DashboardCommandCard eyebrow={eyebrow} title={title}>
      <p className="text-sm leading-6 text-slate-600">{summary}</p>
      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm leading-6 text-slate-500">
            {emptyCopy}
          </div>
        ) : (
          items.slice(0, 4).map((item) => (
            <div
              className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4"
              key={item.id}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                <DashboardStatusPill label={item.meta} tone={item.tone} />
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.supportingText}</p>
            </div>
          ))
        )}
      </div>
    </DashboardCommandCard>
  );
}
