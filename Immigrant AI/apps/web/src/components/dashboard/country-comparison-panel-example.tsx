import { BestOptionBanner } from "@/components/dashboard/best-option-banner";
import { CountryComparisonTable } from "@/components/dashboard/country-comparison-table";
import { PathwayComparisonCard } from "@/components/dashboard/pathway-comparison-card";
import { countryComparisonMock } from "@/lib/country-comparison-mocks";

export function CountryComparisonPanelExample() {
  const bestOption =
    countryComparisonMock.options.find(
      (option) => option.id === countryComparisonMock.bestOptionId
    ) ?? null;

  return (
    <div className="space-y-6">
      <BestOptionBanner
        option={bestOption}
        reasoning={countryComparisonMock.reasoning}
      />
      <CountryComparisonTable options={countryComparisonMock.options} />
      <div className="grid gap-6 xl:grid-cols-3">
        {countryComparisonMock.options.map((option) => (
          <PathwayComparisonCard key={option.id} option={option} />
        ))}
      </div>
    </div>
  );
}
