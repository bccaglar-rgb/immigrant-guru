import type { CountryComparisonData } from "@/types/country-comparison";

export const countryComparisonMock: CountryComparisonData = {
  bestOptionId: "comparison-canada",
  options: [
    {
      costLevel: "medium",
      country: "Canada",
      difficulty: "medium",
      estimatedTime: "4 to 6 months",
      id: "comparison-canada",
      keyAdvantages: [
        "Best current fit for the profile and case evidence.",
        "Most coherent preparation path with the least strategic drift."
      ],
      keyDisadvantages: [
        "Still depends heavily on language proof.",
        "Employment evidence needs stronger documentation."
      ],
      pathway: "Express Entry",
      recommended: true,
      successProbability: 68
    },
    {
      costLevel: "medium",
      country: "Germany",
      difficulty: "high",
      estimatedTime: "5 to 7 months",
      id: "comparison-germany",
      keyAdvantages: [
        "Provides a serious fallback if the primary route weakens.",
        "Can reduce dependence on a single country strategy."
      ],
      keyDisadvantages: [
        "Lower direct fit than the leading route.",
        "Would require different market positioning and execution."
      ],
      pathway: "EU Blue Card",
      recommended: false,
      successProbability: 57
    },
    {
      costLevel: "high",
      country: "United States",
      difficulty: "high",
      estimatedTime: "8 to 12 months",
      id: "comparison-usa",
      keyAdvantages: [
        "Keeps a high-upside route visible for long-term planning.",
        "Could become stronger if the file gains more evidence depth."
      ],
      keyDisadvantages: [
        "Higher evidence burden and operational complexity.",
        "Not as ready as the current lead option."
      ],
      pathway: "EB-2 NIW",
      recommended: false,
      successProbability: 51
    }
  ],
  reasoning:
    "Canada remains the lead option because it combines the strongest current fit, a cleaner preparation sequence, and the clearest immediate next actions. Germany is the best operational fallback, while the U.S. route should remain a reserve path until the file is stronger.",
  summary:
    "Use comparison to sharpen the primary decision, not to fragment preparation effort across too many routes."
};
