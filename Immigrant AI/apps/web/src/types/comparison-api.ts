export const comparisonLevelValues = ["LOW", "MEDIUM", "HIGH"] as const;
export type ComparisonLevel = (typeof comparisonLevelValues)[number];

export type CountryComparisonRequestOption = {
  country: string;
  pathway: string;
};

export type CountryComparisonRequestPayload = {
  options: CountryComparisonRequestOption[];
};

export type CountryComparisonResponseItem = {
  country: string;
  pathway: string;
  success_probability: number;
  estimated_time_months: number;
  cost_level: ComparisonLevel;
  difficulty: ComparisonLevel;
  key_advantages: string[];
  key_disadvantages: string[];
};

export type CountryComparisonResponse = {
  comparison: CountryComparisonResponseItem[];
  best_option: string;
  reasoning: string;
  generated_at: string;
};
