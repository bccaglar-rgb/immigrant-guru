import { getTranslations } from "next-intl/server";

import { getApiHealthStatus } from "@/lib/api";
import { SectionContainer } from "@/components/ui/section-container";

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const isOk = status === "ok";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        isOk ? "bg-green/10 text-green" : "bg-red/10 text-red"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", isOk ? "bg-green" : "bg-red")} />
      {status}
    </span>
  );
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function SystemHealthFallback() {
  return (
    <SectionContainer>
      <div className="glass-card rounded-3xl p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 rounded bg-ink/5" />
          <div className="h-8 w-64 rounded bg-ink/5" />
          <div className="h-4 w-full rounded bg-ink/5" />
        </div>
      </div>
    </SectionContainer>
  );
}

export async function SystemHealth() {
  const [health, t] = await Promise.all([getApiHealthStatus(), getTranslations()]);

  return (
    <SectionContainer
      description={t(
        "Live service check to verify your workspace is connected before relying on strategy, scoring, and document workflows"
      )}
      eyebrow={t("Platform Status")}
      title={t("System health")}
    >
      <div className="glass-card rounded-3xl p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-ink">
              {health.serviceName}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{health.message}</p>
          </div>
          <StatusBadge status={health.statusLabel} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { label: t("Service"), value: health.serviceName },
            { label: t("Last check"), value: health.checkedAtLabel },
            { label: t("Note"), value: health.detailLabel }
          ].map((item) => (
            <div className="rounded-xl border border-line bg-canvas/50 p-4" key={item.label}>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                {item.label}
              </p>
              <p className="mt-2 text-sm font-medium text-ink">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </SectionContainer>
  );
}
