import { cn } from "@/lib/utils";

type DashboardStatusPillProps = Readonly<{
  label: string;
  tone?: "neutral" | "positive" | "warning" | "critical" | "accent";
}>;

const toneStyles: Record<NonNullable<DashboardStatusPillProps["tone"]>, string> = {
  accent: "bg-blue-50 text-blue-700 ring-blue-200/80",
  critical: "bg-rose-50 text-rose-700 ring-rose-200/80",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200/80",
  positive: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
  warning: "bg-amber-50 text-amber-700 ring-amber-200/80"
};

export function DashboardStatusPill({
  label,
  tone = "neutral"
}: DashboardStatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset",
        toneStyles[tone]
      )}
    >
      {label}
    </span>
  );
}
