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
  description: string;
  requires_employer: boolean;
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

export type ProfileAnalysisResult = {
  profile_summary: ProfileSummary;
  visa_matches: VisaMatch[];
  recommendation: Recommendation | null;
  challenges: Challenge[];
  next_step: string;
};
