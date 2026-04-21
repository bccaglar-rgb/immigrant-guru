export type ProfileSummary = {
  text: string;
  nationality: string | null;
  profession: string | null;
  education_level: string | null;
  english_level: string | null;
  years_of_experience: number | null;
  available_capital: string | null;
  target_country: string | null;
};

export type VisaMatch = {
  visa_type: string;
  country: string;
  category: string;
  match_score: number;
  match_level: "high" | "medium" | "low";
  description?: string;
  requires_employer: boolean;
};

export type CountryVisaOption = {
  visa_type: string;
  country: string;
  category: string;
  description: string;
  requires_employer: boolean;
  eligible: boolean;
  match_score: number | null;
  match_level: "high" | "medium" | "low" | null;
  issues: string[];
};

export type Recommendation = {
  visa_type: string;
  country: string;
  match_score: number;
  reason: string;
};

export type Challenge = {
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
};

export type RoadmapStep = {
  step: number;
  title: string;
  description: string;
  status: "done" | "pending";
};

export type CostEstimate = {
  filing: number;
  legal: number;
  medical: number;
  other: number;
  total_low: number;
  total_high: number;
};

export type DocumentItem = {
  document: string;
  required: boolean;
  notes: string;
};

export type ProfileAnalysisResult = {
  profile_summary: ProfileSummary;
  visa_matches: VisaMatch[];
  all_country_visas: CountryVisaOption[];
  recommendation: Recommendation | null;
  challenges: Challenge[];
  next_step: string;
  // Plan-aware fields
  user_plan: string;
  is_premium: boolean;
  ai_upsell_message: string | null;
  // Premium-only fields (null for free users)
  premium_roadmap: RoadmapStep[] | null;
  premium_costs: CostEstimate | null;
  premium_documents: DocumentItem[] | null;
};
