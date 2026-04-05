import {
  profileFormSchema,
  profileFormToUpdatePayload,
  profileToFormValues
} from "@/lib/profile-client";
import type { ProfileFormValues, UserProfile } from "@/types/profile";

describe("profile client helpers", () => {
  it("validates and converts profile form values into backend payload shape", () => {
    const values: ProfileFormValues = {
      first_name: "Ada",
      last_name: "Lovelace",
      nationality: "Turkish",
      current_country: "Turkey",
      target_country: "Canada",
      marital_status: "single",
      children_count: "0",
      education_level: "master",
      english_level: "advanced",
      profession: "Software Engineer",
      years_of_experience: "8",
      available_capital: "125000.50",
      criminal_record_flag: "no",
      prior_visa_refusal_flag: "unknown",
      relocation_timeline: "within_12_months",
      preferred_language: "English"
    };

    expect(() => profileFormSchema.parse(values)).not.toThrow();
    expect(profileFormToUpdatePayload(values)).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      nationality: "Turkish",
      current_country: "Turkey",
      target_country: "Canada",
      marital_status: "single",
      children_count: 0,
      education_level: "master",
      english_level: "advanced",
      profession: "Software Engineer",
      years_of_experience: 8,
      available_capital: "125000.50",
      criminal_record_flag: false,
      prior_visa_refusal_flag: null,
      relocation_timeline: "within_12_months",
      preferred_language: "English"
    });
  });

  it("maps nullable backend profile fields into safe form defaults", () => {
    const profile: UserProfile = {
      id: "cbb6c2c5-fb64-4d6d-86b8-ccf8df23dd13",
      user_id: "a23ab889-d51d-482c-91e5-7375fbcfe9df",
      first_name: null,
      last_name: null,
      nationality: null,
      current_country: null,
      target_country: null,
      marital_status: null,
      children_count: null,
      education_level: null,
      english_level: null,
      profession: null,
      years_of_experience: null,
      available_capital: null,
      criminal_record_flag: true,
      prior_visa_refusal_flag: false,
      relocation_timeline: null,
      preferred_language: null,
      created_at: "2026-04-05T00:00:00Z",
      updated_at: "2026-04-05T00:00:00Z"
    };

    expect(profileToFormValues(profile)).toEqual({
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
      criminal_record_flag: "yes",
      prior_visa_refusal_flag: "no",
      relocation_timeline: "",
      preferred_language: ""
    });
  });
});
