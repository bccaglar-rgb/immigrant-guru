"use client";

import { useTranslations } from "next-intl";

import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Card } from "@/components/ui/card";
import type { CountryComparisonOption } from "@/types/country-comparison";

type CountryComparisonTableProps = Readonly<{
  options: CountryComparisonOption[];
}>;

function probabilityTone(
  probability: number
): "positive" | "warning" | "critical" {
  if (probability >= 65) {
    return "positive";
  }
  if (probability >= 50) {
    return "warning";
  }
  return "critical";
}

function levelTone(
  value: "low" | "medium" | "high"
): "neutral" | "warning" | "critical" {
  if (value === "high") {
    return "critical";
  }
  if (value === "medium") {
    return "warning";
  }
  return "neutral";
}

export function CountryComparisonTable({
  options
}: CountryComparisonTableProps) {
  const t = useTranslations();

  const headerLabels = [
    t("Country"),
    t("Pathway"),
    t("Probability"),
    t("Estimated time"),
    t("Cost"),
    t("Difficulty"),
    t("Best option")
  ];

  return (
    <Card className="overflow-hidden rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] shadow-[0_22px_60px_rgba(15,23,42,0.07)]">
      <div className="border-b border-line/80 px-6 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
          {t("Comparison table")}
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
          {t("Cross-country strategic comparison")}
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-canvas/70 text-left">
              {headerLabels.map((label) => (
                <th
                  className="px-6 py-4 text-xs font-medium uppercase tracking-[0.08em] text-muted"
                  key={label}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {options.map((option) => (
              <tr
                className="border-t border-line/70 text-sm text-ink/80"
                key={option.id}
              >
                <td className="px-6 py-4 font-semibold text-ink">
                  {option.country}
                </td>
                <td className="px-6 py-4">{option.pathway}</td>
                <td className="px-6 py-4">
                  <DashboardStatusPill
                    label={`${option.successProbability}/100`}
                    tone={probabilityTone(option.successProbability)}
                  />
                </td>
                <td className="px-6 py-4">{option.estimatedTime}</td>
                <td className="px-6 py-4">
                  <DashboardStatusPill
                    label={option.costLevel.toUpperCase()}
                    tone={levelTone(option.costLevel)}
                  />
                </td>
                <td className="px-6 py-4">
                  <DashboardStatusPill
                    label={option.difficulty.toUpperCase()}
                    tone={levelTone(option.difficulty)}
                  />
                </td>
                <td className="px-6 py-4">
                  {option.recommended ? (
                    <DashboardStatusPill label={t("Lead option")} tone="positive" />
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
