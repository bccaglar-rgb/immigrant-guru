"use client";

import { useEffect, useMemo, useState } from "react";

import { BestOptionBanner } from "@/components/dashboard/best-option-banner";
import { CountryComparisonTable } from "@/components/dashboard/country-comparison-table";
import { PathwayComparisonCard } from "@/components/dashboard/pathway-comparison-card";
import { Card } from "@/components/ui/card";
import { useAuthSession } from "@/hooks/use-auth-session";
import { compareCountries } from "@/lib/comparison-client";
import type { ImmigrationCase } from "@/types/cases";
import type { CountryComparisonResponse } from "@/types/comparison-api";
import type {
  CountryComparisonData,
  CountryComparisonOption
} from "@/types/country-comparison";

type ComparisonPanelProps = Readonly<{
  accessToken: string;
  caseRecord: ImmigrationCase;
}>;

function mapOption(
  item: CountryComparisonResponse["comparison"][number],
  bestOption: string
): CountryComparisonOption {
  return {
    costLevel: item.cost_level.toLowerCase() as CountryComparisonOption["costLevel"],
    country: item.country,
    difficulty: item.difficulty.toLowerCase() as CountryComparisonOption["difficulty"],
    estimatedTime: `${Math.round(item.estimated_time_months * 10) / 10} months`,
    id: `${item.country}-${item.pathway}`.toLowerCase().replaceAll(/\s+/g, "-"),
    keyAdvantages: item.key_advantages,
    keyDisadvantages: item.key_disadvantages,
    pathway: item.pathway,
    recommended: bestOption === `${item.country} - ${item.pathway}`,
    successProbability: Math.round(item.success_probability)
  };
}

function mapComparison(
  comparison: CountryComparisonResponse
): CountryComparisonData {
  const options = comparison.comparison.map((item) =>
    mapOption(item, comparison.best_option)
  );

  return {
    bestOptionId:
      options.find((option) => option.recommended)?.id ?? null,
    options,
    reasoning: comparison.reasoning,
    summary:
      "Compare your current case against alternative country-pathway routes using the same profile and readiness baseline."
  };
}

const defaultOptions = [
  { country: "Canada", pathway: "Express Entry" },
  { country: "Germany", pathway: "EU Blue Card" },
  { country: "United States", pathway: "EB-2 NIW" }
] as const;

function buildComparisonOptions(caseRecord: ImmigrationCase) {
  const options: Array<{ country: string; pathway: string }> = [];
  const seen = new Set<string>();

  function addOption(country: string | null, pathway: string | null) {
    if (!country || !pathway) {
      return;
    }

    const key = `${country}::${pathway}`.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    options.push({ country, pathway });
  }

  addOption(caseRecord.target_country, caseRecord.target_program);
  defaultOptions.forEach((option) => addOption(option.country, option.pathway));
  return options.slice(0, 3);
}

export function ComparisonPanel({
  accessToken,
  caseRecord
}: ComparisonPanelProps) {
  const { clearSession } = useAuthSession();
  const [comparison, setComparison] = useState<CountryComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const comparisonOptions = useMemo(
    () => buildComparisonOptions(caseRecord),
    [caseRecord]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadComparison() {
      if (comparisonOptions.length < 2) {
        setComparison(null);
        setError("Add a target country and pathway to generate a meaningful comparison.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      const result = await compareCountries(accessToken, {
        options: comparisonOptions
      });

      if (cancelled) {
        return;
      }

      setIsLoading(false);

      if (!result.ok) {
        if (result.status === 401) {
          clearSession();
          return;
        }

        setError(result.errorMessage);
        setComparison(null);
        return;
      }

      setComparison(result.data);
    }

    void loadComparison();

    return () => {
      cancelled = true;
    };
  }, [accessToken, clearSession, comparisonOptions]);

  const data = comparison ? mapComparison(comparison) : null;
  const bestOption =
    data?.options.find((option) => option.id === data.bestOptionId) ?? null;

  return (
    <div className="space-y-6">
      <BestOptionBanner
        option={bestOption}
        reasoning={
          data?.reasoning ||
          "No comparison lead is available until multiple viable scenarios can be evaluated."
        }
      />

      <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_22px_60px_rgba(15,23,42,0.07)] md:p-7">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
          Comparison
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          Country and pathway comparison
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted">
          {data?.summary ||
            "Evaluate multiple country-pathway scenarios using the current profile, readiness state, and case assumptions."}
        </p>
      </Card>

      {isLoading ? (
        <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-8 text-sm leading-7 text-muted shadow-[0_22px_60px_rgba(15,23,42,0.07)]">
          Building the comparison view from your current case and profile...
        </Card>
      ) : error ? (
        <Card className="rounded-[32px] border border-red/20 bg-red/5 p-8 text-sm leading-7 text-red shadow-[0_22px_60px_rgba(15,23,42,0.07)]">
          {error}
        </Card>
      ) : !data || data.options.length === 0 ? (
        <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-8 text-sm leading-7 text-muted shadow-[0_22px_60px_rgba(15,23,42,0.07)]">
          No comparison scenarios have been added to this case yet.
        </Card>
      ) : (
        <>
          <CountryComparisonTable options={data.options} />

          <div className="grid gap-6 xl:grid-cols-3">
            {data.options.map((option) => (
              <PathwayComparisonCard key={option.id} option={option} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
