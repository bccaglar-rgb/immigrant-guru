"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";
import { MobileFormLayout } from "@/components/mobile/mobile-form-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useProfileForm } from "@/hooks/use-profile-form";
import {
  booleanChoiceOptions,
  educationLevelOptions,
  englishLevelOptions,
  maritalStatusOptions,
  relocationTimelineOptions
} from "@/types/profile";
import type { ProfileFormValues } from "@/types/profile";

function isFilled(value: string): boolean {
  return value.trim().length > 0;
}

function getProfileCompletion(values: ProfileFormValues) {
  const fields = [
    values.nationality,
    values.current_country,
    values.target_country,
    values.profession,
    values.years_of_experience,
    values.available_capital,
    values.education_level,
    values.english_level,
    values.relocation_timeline
  ];

  const completed = fields.filter((value) => (typeof value === "string" ? isFilled(value) : value !== "")).length;
  const total = fields.length;

  return Math.round((completed / total) * 100);
}

function MobileProfileSection({
  children,
  description,
  title
}: Readonly<{
  children: ReactNode;
  description: string;
  title: string;
}>) {
  return (
    <Card className="rounded-[28px] p-5">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
        {title}
      </p>
      <p className="mt-2 text-sm leading-7 text-muted">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

export function MobileDashboardProfilePage() {
  const {
    feedback,
    fieldErrors,
    formValues,
    handleFieldChange,
    isDirty,
    isSaving,
    loadError,
    refresh,
    save,
    status
  } = useProfileForm();

  const completion = useMemo(() => getProfileCompletion(formValues), [formValues]);

  if (status === "loading") {
    return (
      <div className="space-y-4">
        <Card className="h-36 animate-pulse rounded-[28px]" />
        <Card className="h-72 animate-pulse rounded-[28px]" />
        <Card className="h-72 animate-pulse rounded-[28px]" />
      </div>
    );
  }

  if (status === "error" && loadError) {
    return (
      <DashboardErrorState
        message={loadError}
        onRetry={() => void refresh()}
        title="The mobile profile editor could not be loaded."
      />
    );
  }

  return (
    <form noValidate onSubmit={save}>
      <MobileFormLayout
        footer={
          <div className="flex items-center gap-3">
            <Button
              disabled={isSaving}
              fullWidth
              onClick={() => {
                void refresh();
              }}
              type="button"
              variant="secondary"
            >
              Refresh
            </Button>
            <Button
              disabled={isSaving || !isDirty}
              fullWidth
              type="submit"
            >
              {isSaving ? "Saving..." : isDirty ? "Save profile" : "Saved"}
            </Button>
          </div>
        }
        header={
          <Card className="rounded-[28px] border border-white/80 bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.6),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-5 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
              Immigration profile
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-ink">
              Keep your mobile case profile current
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              The information here powers pathway scoring, probability estimates, and case recommendations.
            </p>
            <div className="mt-5 rounded-2xl bg-white/90 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                Completion
              </p>
              <p className="mt-2 text-2xl font-semibold text-ink">{completion}%</p>
            </div>
          </Card>
        }
      >
        {feedback ? (
          <div
            className={`rounded-2xl border px-4 py-4 text-sm ${
              feedback.tone === "success"
                ? "border-green/20 bg-green/10 text-green"
                : "border-red/20 bg-red/5 text-red"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <MobileProfileSection
          description="Identity, family context, and communication preference."
          title="Personal"
        >
          <Input
            autoComplete="given-name"
            error={fieldErrors.first_name}
            label="First name"
            onChange={(event) => handleFieldChange("first_name", event.target.value)}
            value={formValues.first_name}
          />
          <Input
            autoComplete="family-name"
            error={fieldErrors.last_name}
            label="Last name"
            onChange={(event) => handleFieldChange("last_name", event.target.value)}
            value={formValues.last_name}
          />
          <Input
            error={fieldErrors.nationality}
            label="Nationality"
            onChange={(event) => handleFieldChange("nationality", event.target.value)}
            value={formValues.nationality}
          />
          <Input
            error={fieldErrors.current_country}
            label="Current country"
            onChange={(event) => handleFieldChange("current_country", event.target.value)}
            value={formValues.current_country}
          />
          <Select
            error={fieldErrors.marital_status}
            label="Marital status"
            onChange={(event) => handleFieldChange("marital_status", event.target.value)}
            placeholder="Select marital status"
            value={formValues.marital_status}
          >
            {maritalStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            error={fieldErrors.children_count}
            inputMode="numeric"
            label="Children count"
            onChange={(event) => handleFieldChange("children_count", event.target.value)}
            value={formValues.children_count}
          />
          <Input
            error={fieldErrors.preferred_language}
            label="Preferred language"
            onChange={(event) =>
              handleFieldChange("preferred_language", event.target.value)
            }
            value={formValues.preferred_language}
          />
        </MobileProfileSection>

        <MobileProfileSection
          description="Destination, timing, and risk context for strategy generation."
          title="Immigration goals"
        >
          <Input
            error={fieldErrors.target_country}
            label="Target country"
            onChange={(event) => handleFieldChange("target_country", event.target.value)}
            value={formValues.target_country}
          />
          <Select
            error={fieldErrors.relocation_timeline}
            label="Relocation timeline"
            onChange={(event) =>
              handleFieldChange("relocation_timeline", event.target.value)
            }
            placeholder="Select timeline"
            value={formValues.relocation_timeline}
          >
            {relocationTimelineOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            error={fieldErrors.prior_visa_refusal_flag}
            label="Prior visa refusal"
            onChange={(event) =>
              handleFieldChange("prior_visa_refusal_flag", event.target.value)
            }
            value={formValues.prior_visa_refusal_flag}
          >
            {booleanChoiceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            error={fieldErrors.criminal_record_flag}
            label="Criminal record"
            onChange={(event) =>
              handleFieldChange("criminal_record_flag", event.target.value)
            }
            value={formValues.criminal_record_flag}
          >
            {booleanChoiceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </MobileProfileSection>

        <MobileProfileSection
          description="Education, language, and work history strength."
          title="Professional background"
        >
          <Select
            error={fieldErrors.education_level}
            label="Education level"
            onChange={(event) => handleFieldChange("education_level", event.target.value)}
            placeholder="Select education level"
            value={formValues.education_level}
          >
            {educationLevelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            error={fieldErrors.english_level}
            label="English level"
            onChange={(event) => handleFieldChange("english_level", event.target.value)}
            placeholder="Select English level"
            value={formValues.english_level}
          >
            {englishLevelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            error={fieldErrors.profession}
            label="Profession"
            onChange={(event) => handleFieldChange("profession", event.target.value)}
            value={formValues.profession}
          />
          <Input
            error={fieldErrors.years_of_experience}
            inputMode="numeric"
            label="Years of experience"
            onChange={(event) =>
              handleFieldChange("years_of_experience", event.target.value)
            }
            value={formValues.years_of_experience}
          />
          <Input
            error={fieldErrors.available_capital}
            inputMode="decimal"
            label="Available capital"
            onChange={(event) =>
              handleFieldChange("available_capital", event.target.value)
            }
            value={formValues.available_capital}
          />
        </MobileProfileSection>
      </MobileFormLayout>
    </form>
  );
}
