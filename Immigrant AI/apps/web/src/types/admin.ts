import type { ImmigrationCaseSummary } from "@/types/cases";
import type { UserProfile } from "@/types/profile";

export const knowledgeSourceTypeValues = [
  "government_website",
  "policy_manual",
  "form_instructions",
  "legal_guidance",
  "expert_content",
  "news_article",
  "internal_reference"
] as const;

export type KnowledgeSourceType = (typeof knowledgeSourceTypeValues)[number];

export const knowledgeAuthorityLevelValues = [
  "primary",
  "secondary",
  "tertiary"
] as const;

export type KnowledgeAuthorityLevel =
  (typeof knowledgeAuthorityLevelValues)[number];

export const knowledgeSourceTypeOptions = [
  { label: "Government website", value: "government_website" },
  { label: "Policy manual", value: "policy_manual" },
  { label: "Form instructions", value: "form_instructions" },
  { label: "Legal guidance", value: "legal_guidance" },
  { label: "Expert content", value: "expert_content" },
  { label: "News article", value: "news_article" },
  { label: "Internal reference", value: "internal_reference" }
] as const;

export const knowledgeAuthorityLevelOptions = [
  { label: "Primary authority", value: "primary" },
  { label: "Secondary authority", value: "secondary" },
  { label: "Tertiary authority", value: "tertiary" }
] as const;

export type ServiceVersion = {
  environment: string;
  name: string;
  version: string;
};

export type DatabaseCheck = {
  database: string;
  status: string;
};

export type AdminUserDirectoryEntry = {
  created_at: string;
  email: string;
  email_verified: boolean;
  id: string;
  immigration_cases: ImmigrationCaseSummary[];
  plan: string;
  profile: UserProfile | null;
  status: string;
  updated_at: string;
};

export type AdminStats = {
  active_users: number;
  by_plan: Record<string, number>;
  registered_today: number;
  registered_this_week: number;
  suspended_users: number;
  total_users: number;
  unverified_users: number;
  verified_users: number;
};

export type AiFeedbackEntry = {
  case_id: string;
  comment: string | null;
  created_at: string;
  feature: string;
  id: string;
  rating: string;
  target_id: string | null;
  updated_at: string;
  user_id: string;
};

export type AiFeedbackSummary = {
  by_feature: Record<string, number>;
  generated_at: string;
  negative_feedback: number;
  positive_feedback: number;
  recent_feedback: AiFeedbackEntry[];
  total_feedback: number;
};

export type KnowledgeSourceSummary = {
  authority_level: KnowledgeAuthorityLevel;
  country: string | null;
  created_at: string;
  id: string;
  language: string | null;
  metadata: Record<string, unknown>;
  published_at?: string | null;
  source_name: string;
  source_type: KnowledgeSourceType;
  updated_at: string;
  verified_at?: string | null;
  visa_type: string | null;
};

export type KnowledgeChunkRecord = {
  chunk_index: number;
  chunk_text: string;
  created_at: string;
  id: string;
  language: string | null;
  metadata: Record<string, unknown>;
  source_id: string;
  updated_at: string;
};

export type KnowledgeSearchResult = {
  authority_score: number;
  chunk: KnowledgeChunkRecord;
  freshness_score: number;
  lexical_score: number;
  match_reason: string;
  matched_terms: string[];
  score: number;
  source: KnowledgeSourceSummary;
};

export type KnowledgeSearchResponse = {
  backend: string;
  results: KnowledgeSearchResult[];
  total_results: number;
};

export type KnowledgeSearchPayload = {
  authority_levels?: KnowledgeAuthorityLevel[];
  country?: string | null;
  language?: string | null;
  limit?: number;
  query: string;
  source_types?: KnowledgeSourceType[];
  visa_type?: string | null;
};

export type KnowledgeSourceCreatePayload = {
  authority_level: KnowledgeAuthorityLevel;
  chunks?: [];
  country?: string | null;
  language?: string | null;
  metadata?: Record<string, unknown>;
  published_at?: string | null;
  source_name: string;
  source_type: KnowledgeSourceType;
  verified_at?: string | null;
  visa_type?: string | null;
};

export type KnowledgeChunkCreatePayload = {
  chunk_index: number;
  chunk_text: string;
  language?: string | null;
  metadata?: Record<string, unknown>;
  source_id: string;
};
