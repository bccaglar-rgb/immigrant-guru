import { BestOptionBanner } from "@/components/dashboard/best-option-banner";
import { CountryComparisonTable } from "@/components/dashboard/country-comparison-table";
import { PathwayComparisonCard } from "@/components/dashboard/pathway-comparison-card";
import { Card } from "@/components/ui/card";
import type { CaseWorkspaceComparison } from "@/types/case-workspace";
import type {
  CountryComparisonData,
  CountryComparisonOption
} from "@/types/country-comparison";

type ComparisonPanelProps = Readonly<{
  comparison: CaseWorkspaceComparison;
}>;

function mapOption(
  item: CaseWorkspaceComparison["items"][number]
): CountryComparisonOption {
  return {
    costLevel: item.costLevel,
    country: item.country,
    difficulty: item.difficulty,
    estimatedTime: item.timelineLabel,
    id: item.id,
    keyAdvantages: item.advantages,
    keyDisadvantages: item.disadvantages,
    pathway: item.pathway,
    recommended: item.recommended,
    successProbability: item.probability
  };
}

function mapComparison(
  comparison: CaseWorkspaceComparison
): CountryComparisonData {
  const options = comparison.items.map(mapOption);

  return {
    bestOptionId:
      comparison.items.find((item) => item.recommended)?.id ?? null,
    options,
    reasoning: comparison.reasoning,
    summary: comparison.summary
  };
}

export function ComparisonPanel({ comparison }: ComparisonPanelProps) {
  const data = mapComparison(comparison);
  const bestOption =
    data.options.find((option) => option.id === data.bestOptionId) ?? null;

  return (
    <div className="space-y-6">
      <BestOptionBanner option={bestOption} reasoning={data.reasoning} />

      <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_22px_60px_rgba(15,23,42,0.07)] md:p-7">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
          Comparison
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          Country and pathway comparison
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted">
          {data.summary}
        </p>
      </Card>

      {data.options.length === 0 ? (
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
