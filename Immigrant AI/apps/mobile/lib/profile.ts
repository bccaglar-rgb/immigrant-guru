/**
 * Profile types + API client — mirrors apps/web/src/types/profile.ts.
 * Kept intentionally in sync: the backend expects snake_case fields.
 */
import { api } from "./api-client";

export const maritalStatusValues = [
  "single",
  "married",
  "divorced",
  "separated",
  "widowed",
  "partnered"
] as const;
export type MaritalStatus = (typeof maritalStatusValues)[number];

export const educationLevelValues = [
  "high_school",
  "vocational",
  "associate",
  "bachelor",
  "master",
  "doctorate",
  "other"
] as const;
export type EducationLevel = (typeof educationLevelValues)[number];

export const englishLevelValues = [
  "none",
  "basic",
  "intermediate",
  "advanced",
  "fluent",
  "native"
] as const;
export type EnglishLevel = (typeof englishLevelValues)[number];

export const relocationTimelineValues = [
  "immediately",
  "within_3_months",
  "within_6_months",
  "within_12_months",
  "exploring"
] as const;
export type RelocationTimeline = (typeof relocationTimelineValues)[number];

export const booleanChoiceValues = ["unknown", "yes", "no"] as const;
export type BooleanChoice = (typeof booleanChoiceValues)[number];

export type SelectOption<T extends string = string> = { label: string; value: T };

export const maritalStatusOptions: ReadonlyArray<SelectOption<MaritalStatus>> = [
  { label: "Single", value: "single" },
  { label: "Married", value: "married" },
  { label: "Divorced", value: "divorced" },
  { label: "Separated", value: "separated" },
  { label: "Widowed", value: "widowed" },
  { label: "Partnered", value: "partnered" }
];

export const educationLevelOptions: ReadonlyArray<SelectOption<EducationLevel>> = [
  { label: "High school", value: "high_school" },
  { label: "Vocational training", value: "vocational" },
  { label: "Associate", value: "associate" },
  { label: "Bachelor's", value: "bachelor" },
  { label: "Master's", value: "master" },
  { label: "Doctorate", value: "doctorate" },
  { label: "Other", value: "other" }
];

export const englishLevelOptions: ReadonlyArray<SelectOption<EnglishLevel>> = [
  { label: "None", value: "none" },
  { label: "Basic", value: "basic" },
  { label: "Intermediate", value: "intermediate" },
  { label: "Advanced", value: "advanced" },
  { label: "Fluent", value: "fluent" },
  { label: "Native", value: "native" }
];

export const relocationTimelineOptions: ReadonlyArray<SelectOption<RelocationTimeline>> = [
  { label: "Immediately", value: "immediately" },
  { label: "Within 3 months", value: "within_3_months" },
  { label: "Within 6 months", value: "within_6_months" },
  { label: "Within 12 months", value: "within_12_months" },
  { label: "Exploring", value: "exploring" }
];

export const booleanChoiceOptions: ReadonlyArray<SelectOption<BooleanChoice>> = [
  { label: "Prefer not to say", value: "unknown" },
  { label: "No", value: "no" },
  { label: "Yes", value: "yes" }
];

export type UserProfile = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  nationality: string | null;
  current_country: string | null;
  target_country: string | null;
  marital_status: MaritalStatus | null;
  children_count: number | null;
  education_level: EducationLevel | null;
  english_level: EnglishLevel | null;
  profession: string | null;
  years_of_experience: number | null;
  available_capital: string | null;
  criminal_record_flag: boolean | null;
  prior_visa_refusal_flag: boolean | null;
  relocation_timeline: RelocationTimeline | null;
  preferred_language: string | null;
};

export type ProfileFormValues = {
  first_name: string;
  last_name: string;
  nationality: string;
  current_country: string;
  target_country: string;
  marital_status: MaritalStatus | "";
  children_count: string;
  education_level: EducationLevel | "";
  english_level: EnglishLevel | "";
  profession: string;
  years_of_experience: string;
  available_capital: string;
  criminal_record_flag: BooleanChoice;
  prior_visa_refusal_flag: BooleanChoice;
  relocation_timeline: RelocationTimeline | "";
  preferred_language: string;
};

export const emptyProfileFormValues: ProfileFormValues = {
  first_name: "",
  last_name: "",
  nationality: "",
  current_country: "",
  target_country: "",
  marital_status: "",
  children_count: "",
  education_level: "",
  english_level: "",
  profession: "",
  years_of_experience: "",
  available_capital: "",
  criminal_record_flag: "unknown",
  prior_visa_refusal_flag: "unknown",
  relocation_timeline: "",
  preferred_language: ""
};

// ── Serialisation ──────────────────────────────────────────────────────────────

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t.length > 0 ? t : null;
}

function emptyToInt(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function boolChoice(v: BooleanChoice): boolean | null {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}

export function formToUpdatePayload(values: ProfileFormValues) {
  return {
    first_name: emptyToNull(values.first_name),
    last_name: emptyToNull(values.last_name),
    nationality: emptyToNull(values.nationality),
    current_country: emptyToNull(values.current_country),
    target_country: emptyToNull(values.target_country),
    marital_status: values.marital_status === "" ? null : values.marital_status,
    children_count: emptyToInt(values.children_count),
    education_level: values.education_level === "" ? null : values.education_level,
    english_level: values.english_level === "" ? null : values.english_level,
    profession: emptyToNull(values.profession),
    years_of_experience: emptyToInt(values.years_of_experience),
    available_capital: emptyToNull(values.available_capital),
    criminal_record_flag: boolChoice(values.criminal_record_flag),
    prior_visa_refusal_flag: boolChoice(values.prior_visa_refusal_flag),
    relocation_timeline: values.relocation_timeline === "" ? null : values.relocation_timeline,
    preferred_language: emptyToNull(values.preferred_language)
  };
}

export function profileToForm(p: UserProfile | null): ProfileFormValues {
  if (!p) return { ...emptyProfileFormValues };
  const toChoice = (v: boolean | null): BooleanChoice =>
    v === true ? "yes" : v === false ? "no" : "unknown";
  return {
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    nationality: p.nationality ?? "",
    current_country: p.current_country ?? "",
    target_country: p.target_country ?? "",
    marital_status: p.marital_status ?? "",
    children_count: p.children_count != null ? String(p.children_count) : "",
    education_level: p.education_level ?? "",
    english_level: p.english_level ?? "",
    profession: p.profession ?? "",
    years_of_experience: p.years_of_experience != null ? String(p.years_of_experience) : "",
    available_capital: p.available_capital ?? "",
    criminal_record_flag: toChoice(p.criminal_record_flag),
    prior_visa_refusal_flag: toChoice(p.prior_visa_refusal_flag),
    relocation_timeline: p.relocation_timeline ?? "",
    preferred_language: p.preferred_language ?? ""
  };
}

// ── API ─────────────────────────────────────────────────────────────────────────

export async function fetchMyProfile() {
  return api.get<UserProfile>("/profile/me");
}

export async function updateMyProfile(values: ProfileFormValues) {
  return api.put<UserProfile>("/profile/me", formToUpdatePayload(values));
}
