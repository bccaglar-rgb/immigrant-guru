import {
  profileFormSchema,
  profileFormToUpdatePayload,
  userProfileSchema
} from "@/lib/profile-client";
import type { ProfileFormValues } from "@/types/profile";

describe("profile contract", () => {
  it("accepts the backend profile response shape used by the frontend", () => {
    const payload = {
      id: "0d22dcc8-a730-4ff6-bf0f-af83579f9e0a",
      user_id: "4b483907-191b-4f27-a5ed-dd9837622db0",
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
      preferred_language: "English",
      created_at: "2026-04-05T00:00:00Z",
      updated_at: "2026-04-05T00:00:00Z"
    };

    expect(userProfileSchema.parse(payload)).toEqual(payload);
  });

  it("rejects invalid backend profile response payloads", () => {
    expect(() =>
      userProfileSchema.parse({
        id: "0d22dcc8-a730-4ff6-bf0f-af83579f9e0a",
        user_id: "4b483907-191b-4f27-a5ed-dd9837622db0",
        first_name: "Ada",
        last_name: "Lovelace",
        nationality: "Turkish",
        current_country: "Turkey",
        target_country: "Canada",
        marital_status: "complicated",
        children_count: 0,
        education_level: "master",
        english_level: "advanced",
        profession: "Software Engineer",
        years_of_experience: 8,
        available_capital: "125000.50",
        criminal_record_flag: false,
        prior_visa_refusal_flag: null,
        relocation_timeline: "within_12_months",
        preferred_language: "English",
        created_at: "2026-04-05T00:00:00Z",
        updated_at: "2026-04-05T00:00:00Z"
      })
    ).toThrow();
  });

  it("emits a payload shape the backend update schema can accept", () => {
    const values: ProfileFormValues = {
      first_name: "Ada",
      last_name: "Lovelace",
      nationality: "",
      current_country: "",
      target_country: "Canada",
      marital_status: "",
      children_count: "",
      education_level: "master",
      english_level: "advanced",
      profession: "Software Engineer",
      years_of_experience: "8",
      available_capital: "",
      criminal_record_flag: "unknown",
      prior_visa_refusal_flag: "no",
      relocation_timeline: "",
      preferred_language: ""
    };

    expect(profileFormToUpdatePayload(values)).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      nationality: null,
      current_country: null,
      target_country: "Canada",
      marital_status: null,
      children_count: null,
      education_level: "master",
      english_level: "advanced",
      profession: "Software Engineer",
      years_of_experience: 8,
      available_capital: null,
      criminal_record_flag: null,
      prior_visa_refusal_flag: false,
      relocation_timeline: null,
      preferred_language: null
    });
  });

  it("rejects invalid profile form payloads before they reach the backend", () => {
    expect(() =>
      profileFormSchema.parse({
        first_name: "Ada",
        last_name: "Lovelace",
        nationality: "Turkish",
        current_country: "Turkey",
        target_country: "Canada",
        marital_status: "single",
        children_count: "-1",
        education_level: "master",
        english_level: "advanced",
        profession: "Software Engineer",
        years_of_experience: "8",
        available_capital: "12.345",
        criminal_record_flag: "no",
        prior_visa_refusal_flag: "unknown",
        relocation_timeline: "within_12_months",
        preferred_language: "English"
      })
    ).toThrow();
  });
});
