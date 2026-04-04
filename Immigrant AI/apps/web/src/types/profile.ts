export type SelectOption<T extends string = string> = {
  label: string;
  value: T;
};

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
  { label: "Associate degree", value: "associate" },
  { label: "Bachelor's degree", value: "bachelor" },
  { label: "Master's degree", value: "master" },
  { label: "Doctorate", value: "doctorate" },
  { label: "Other", value: "other" }
];

export const englishLevelOptions: ReadonlyArray<SelectOption<EnglishLevel>> = [
  { label: "No English yet", value: "none" },
  { label: "Basic", value: "basic" },
  { label: "Intermediate", value: "intermediate" },
  { label: "Advanced", value: "advanced" },
  { label: "Fluent", value: "fluent" },
  { label: "Native", value: "native" }
];

export const relocationTimelineOptions: ReadonlyArray<
  SelectOption<RelocationTimeline>
> = [
  { label: "Immediately", value: "immediately" },
  { label: "Within 3 months", value: "within_3_months" },
  { label: "Within 6 months", value: "within_6_months" },
  { label: "Within 12 months", value: "within_12_months" },
  { label: "Exploring options", value: "exploring" }
];

export const booleanChoiceOptions: ReadonlyArray<SelectOption<BooleanChoice>> = [
  { label: "Not disclosed", value: "unknown" },
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" }
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
  created_at: string;
  updated_at: string;
};

export type UserProfileUpdatePayload = Partial<{
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
}>;

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

export type ProfileFormField = keyof ProfileFormValues;

export type ProfileFieldErrors = Partial<Record<ProfileFormField, string>>;

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
