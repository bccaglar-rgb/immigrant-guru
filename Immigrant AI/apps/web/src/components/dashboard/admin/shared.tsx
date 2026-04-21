import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  sub,
  tone = "default",
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "good" | "warn" | "accent";
  accent?: string;
}) {
  const color =
    tone === "good"
      ? "text-green-600"
      : tone === "warn"
        ? "text-red"
        : tone === "accent"
          ? "text-accent"
          : "text-ink";
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
        {accent ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
            {accent}
          </span>
        ) : null}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tracking-tight", color)}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </Card>
  );
}

export function SectionTitle({ children, count }: { children: React.ReactNode; count?: number | string }) {
  return (
    <div className="flex items-baseline gap-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{children}</p>
      {count !== undefined ? (
        <span className="text-[11px] font-semibold text-muted/60">({count})</span>
      ) : null}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function fmtDateShort(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  plus: "Plus",
  premium: "Premium",
};

export const PLAN_COLORS: Record<string, string> = {
  free: "bg-canvas border-line text-muted",
  starter: "bg-blue-50 border-blue-200 text-blue-700",
  plus: "bg-accent/10 border-accent/30 text-accent",
  premium: "bg-amber-50 border-amber-200 text-amber-700",
};

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-canvas border-line text-muted",
  in_review: "bg-blue-50 border-blue-200 text-blue-700",
  active: "bg-green/10 border-green/20 text-green-700",
  closed: "bg-ink/5 border-line text-muted",
  pending: "bg-amber-50 border-amber-200 text-amber-700",
  uploaded: "bg-blue-50 border-blue-200 text-blue-700",
  processing: "bg-accent/10 border-accent/30 text-accent",
  failed: "bg-red/5 border-red/20 text-red",
};
