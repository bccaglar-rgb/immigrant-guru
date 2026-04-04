export type ComparisonLevel = "low" | "medium" | "high";

export type CountryComparisonOption = {
  country: string;
  difficulty: ComparisonLevel;
  estimatedTime: string;
  id: string;
  keyAdvantages: string[];
  keyDisadvantages: string[];
  pathway: string;
  recommended: boolean;
  successProbability: number;
  costLevel: ComparisonLevel;
};

export type CountryComparisonData = {
  bestOptionId: string | null;
  options: CountryComparisonOption[];
  reasoning: string;
  summary: string;
};
