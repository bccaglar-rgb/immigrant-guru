"use client";

import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { getGrowthAnalytics, getRevenueAnalytics } from "@/lib/admin-client";
import { cn } from "@/lib/utils";
import type { GrowthAnalytics, RevenueAnalytics } from "@/types/admin";

import { EmptyState, MetricCard, PLAN_COLORS, PLAN_LABELS, SectionTitle } from "./shared";

const fmtUSD = (n: number) => `$${n.toLocaleString("en-US")}`;

export function RevenueTab({ accessToken }: { accessToken: string }) {
  const [revenue, setRevenue] = useState<RevenueAnalytics | null>(null);
  const [growth, setGrowth] = useState<GrowthAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [r, g] = await Promise.all([
      getRevenueAnalytics(accessToken),
      getGrowthAnalytics(accessToken, 30),
    ]);
    if (r.ok) setRevenue(r.data);
    else setError(r.errorMessage);
    if (g.ok) setGrowth(g.data);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="h-24 animate-pulse p-5" />
        ))}
      </div>
    );
  }

  if (error || !revenue) {
    return <p className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red">{error || "Could not load revenue."}</p>;
  }

  const paidTotal = revenue.paid_user_count + revenue.free_user_count;
  const conversionRate = paidTotal > 0 ? Math.round((revenue.paid_user_count / paidTotal) * 100) : 0;
  const maxBar = Math.max(...revenue.by_plan.map((p) => p.revenue_usd), 1);

  // Growth chart scaling
  const maxSignups = growth ? Math.max(...growth.daily.map((d) => d.signups), 1) : 1;

  return (
    <div className="space-y-6">
      {/* Top KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total revenue"
          value={fmtUSD(revenue.total_revenue_usd)}
          sub="One-time lifetime payments"
          tone="accent"
        />
        <MetricCard
          label="Paid users"
          value={revenue.paid_user_count}
          sub={`${conversionRate}% conversion from free`}
          tone="good"
        />
        <MetricCard
          label="ARPU"
          value={fmtUSD(Math.round(revenue.arpu_usd))}
          sub="Avg revenue per paying user"
        />
        <MetricCard
          label="Free users"
          value={revenue.free_user_count}
          sub="Converted or not yet"
        />
      </div>

      {/* Revenue by plan with bars */}
      <Card className="p-6">
        <SectionTitle>Revenue by plan</SectionTitle>
        <div className="mt-4 space-y-3">
          {revenue.by_plan.map((p) => {
            const pct = maxBar > 0 ? (p.revenue_usd / maxBar) * 100 : 0;
            const shareOfTotal =
              revenue.total_revenue_usd > 0
                ? Math.round((p.revenue_usd / revenue.total_revenue_usd) * 100)
                : 0;
            return (
              <div key={p.plan} className="group">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        PLAN_COLORS[p.plan] ?? "bg-canvas border-line text-ink",
                      )}
                    >
                      {PLAN_LABELS[p.plan] ?? p.plan}
                    </span>
                    <span className="text-xs text-muted">
                      {p.user_count} user{p.user_count !== 1 ? "s" : ""} × ${p.price_usd}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-ink">{fmtUSD(p.revenue_usd)}</span>
                    <span className="text-[10px] font-semibold text-muted">{shareOfTotal}%</span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Growth chart */}
      {growth ? (
        <Card className="p-6">
          <div className="flex items-baseline justify-between">
            <SectionTitle>Daily signups — last {growth.range_days} days</SectionTitle>
            <span className="text-sm font-semibold text-accent">{growth.total_in_range} total</span>
          </div>
          <div className="mt-5">
            {growth.total_in_range === 0 ? (
              <EmptyState>No signups in this range yet.</EmptyState>
            ) : (
              <div className="flex h-36 items-end gap-1">
                {growth.daily.map((d) => {
                  const h = d.signups > 0 ? Math.max((d.signups / maxSignups) * 100, 4) : 0;
                  return (
                    <div
                      key={d.date}
                      className="group relative flex-1"
                      title={`${d.date}: ${d.signups} signup${d.signups !== 1 ? "s" : ""}`}
                    >
                      <div
                        className={cn(
                          "w-full rounded-t-md transition-colors",
                          d.signups > 0 ? "bg-accent/60 hover:bg-accent" : "bg-canvas",
                        )}
                        style={{ height: `${h}%`, minHeight: d.signups > 0 ? "4px" : "2px" }}
                      />
                      {d.signups > 0 ? (
                        <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white group-hover:block">
                          {d.signups}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-2 flex justify-between text-[10px] text-muted">
              <span>{growth.daily[0]?.date ?? ""}</span>
              <span>{growth.daily[growth.daily.length - 1]?.date ?? ""}</span>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
