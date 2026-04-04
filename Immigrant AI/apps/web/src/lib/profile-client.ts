import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";
import {
  booleanChoiceValues,
  educationLevelValues,
  emptyProfileFormValues,
  englishLevelValues,
  maritalStatusValues,
  relocationTimelineValues
} from "@/types/profile";
import type {
  BooleanChoice,
  ProfileFormValues,
  UserProfile,
  UserProfileUpdatePayload
} from "@/types/profile";

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  nationality: z.string().nullable(),
  current_country: z.string().nullable(),
  target_country: z.string().nullable(),
  marital_status: z.enum(maritalStatusValues).nullable(),
  children_count: z.number().int().nullable(),
  education_level: z.enum(educationLevelValues).nullable(),
  english_level: z.enum(englishLevelValues).nullable(),
  profession: z.string().nullable(),
  years_of_experience: z.number().int().nullable(),
  available_capital: z.string().nullable(),
  criminal_record_flag: z.boolean().nullable(),
  prior_visa_refusal_flag: z.boolean().nullable(),
  relocation_timeline: z.enum(relocationTimelineValues).nullable(),
  preferred_language: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

function textField(maxLength: number, message: string) {
  return z.string().trim().max(maxLength, message);
}

function integerField({
  label,
  max,
  min
}: {
  label: string;
  max: number;
  min: number;
}) {
  return z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d+$/.test(value), {
      message: `${label} must be a whole number.`
    })
    .refine((value) => value === "" || Number(value) >= min, {
      message: `${label} must be at least ${min}.`
    })
    .refine((value) => value === "" || Number(value) <= max, {
      message: `${label} must be ${max} or less.`
    });
}

export const profileFormSchema = z.object({
  first_name: textField(100, "First name is too long."),
  last_name: textField(100, "Last name is too long."),
  nationality: textField(100, "Nationality is too long."),
  current_country: textField(100, "Current country is too long."),
  target_country: textField(100, "Target country is too long."),
  marital_status: z.union([z.literal(""), z.enum(maritalStatusValues)]),
  children_count: integerField({
    label: "Children count",
    max: 20,
    min: 0
  }),
  education_level: z.union([z.literal(""), z.enum(educationLevelValues)]),
  english_level: z.union([z.literal(""), z.enum(englishLevelValues)]),
  profession: textField(150, "Profession is too long."),
  years_of_experience: integerField({
    label: "Years of experience",
    max: 80,
    min: 0
  }),
  available_capital: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value), {
      message: "Available capital must be a valid amount with up to 2 decimals."
    })
    .refine((value) => value === "" || value.replace(".", "").length <= 12, {
      message: "Available capital is too large."
    }),
  criminal_record_flag: z.enum(booleanChoiceValues),
  prior_visa_refusal_flag: z.enum(booleanChoiceValues),
  relocation_timeline: z.union([z.literal(""), z.enum(relocationTimelineValues)]),
  preferred_language: textField(32, "Preferred language is too long.")
});

function emptyToNull(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function emptyToInteger(value: string): number | null {
  const normalized = value.trim();
  return normalized.length > 0 ? Number.parseInt(normalized, 10) : null;
}

function booleanChoiceToValue(choice: BooleanChoice): boolean | null {
  if (choice === "yes") {
    return true;
  }

  if (choice === "no") {
    return false;
  }

  return null;
}

function booleanValueToChoice(value: boolean | null): BooleanChoice {
  if (value === true) {
    return "yes";
  }

  if (value === false) {
    return "no";
  }

  return "unknown";
}

export function profileToFormValues(profile: UserProfile): ProfileFormValues {
  return {
    first_name: profile.first_name ?? emptyProfileFormValues.first_name,
    last_name: profile.last_name ?? emptyProfileFormValues.last_name,
    nationality: profile.nationality ?? emptyProfileFormValues.nationality,
    current_country:
      profile.current_country ?? emptyProfileFormValues.current_country,
    target_country: profile.target_country ?? emptyProfileFormValues.target_country,
    marital_status: profile.marital_status ?? emptyProfileFormValues.marital_status,
    children_count:
      profile.children_count === null ? "" : String(profile.children_count),
    education_level:
      profile.education_level ?? emptyProfileFormValues.education_level,
    english_level: profile.english_level ?? emptyProfileFormValues.english_level,
    profession: profile.profession ?? emptyProfileFormValues.profession,
    years_of_experience:
      profile.years_of_experience === null
        ? ""
        : String(profile.years_of_experience),
    available_capital:
      profile.available_capital ?? emptyProfileFormValues.available_capital,
    criminal_record_flag: booleanValueToChoice(profile.criminal_record_flag),
    prior_visa_refusal_flag: booleanValueToChoice(
      profile.prior_visa_refusal_flag
    ),
    relocation_timeline:
      profile.relocation_timeline ?? emptyProfileFormValues.relocation_timeline,
    preferred_language:
      profile.preferred_language ?? emptyProfileFormValues.preferred_language
  };
}

export function profileFormToUpdatePayload(
  values: ProfileFormValues
): UserProfileUpdatePayload {
  return {
    first_name: emptyToNull(values.first_name),
    last_name: emptyToNull(values.last_name),
    nationality: emptyToNull(values.nationality),
    current_country: emptyToNull(values.current_country),
    target_country: emptyToNull(values.target_country),
    marital_status: values.marital_status || null,
    children_count: emptyToInteger(values.children_count),
    education_level: values.education_level || null,
    english_level: values.english_level || null,
    profession: emptyToNull(values.profession),
    years_of_experience: emptyToInteger(values.years_of_experience),
    available_capital: emptyToNull(values.available_capital),
    criminal_record_flag: booleanChoiceToValue(values.criminal_record_flag),
    prior_visa_refusal_flag: booleanChoiceToValue(
      values.prior_visa_refusal_flag
    ),
    relocation_timeline: values.relocation_timeline || null,
    preferred_language: emptyToNull(values.preferred_language)
  };
}

function invalidProfileResponse(message: string): ApiRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

export async function getMyProfile(
  accessToken: string
): Promise<ApiRequestResult<UserProfile>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "GET",
    path: "/profile/me",
    retries: 0,
    timeoutMs: 5000
  });

  if (!response.ok) {
    return {
      ok: false,
      errorMessage: response.errorMessage,
      status: response.status
    };
  }

  const parsed = userProfileSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidProfileResponse("Profile response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}

export async function updateMyProfile(
  accessToken: string,
  payload: UserProfileUpdatePayload
): Promise<ApiRequestResult<UserProfile>> {
  const response = await apiRequest({
    authToken: accessToken,
    body: payload,
    method: "PUT",
    path: "/profile/me",
    retries: 0,
    timeoutMs: 5000
  });

  if (!response.ok) {
    return {
      ok: false,
      errorMessage: response.errorMessage,
      status: response.status
    };
  }

  const parsed = userProfileSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidProfileResponse("Updated profile response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}
