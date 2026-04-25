"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";
import { MobileDashboardProfilePage } from "@/components/mobile/mobile-dashboard-profile-page";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useProfileForm } from "@/hooks/use-profile-form";
import {
  booleanChoiceOptions,
  educationLevelOptions,
  englishLevelOptions,
  maritalStatusOptions,
  relocationTimelineOptions
} from "@/types/profile";
import type { ProfileFormValues } from "@/types/profile";

function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function isFilled(value: string): boolean {
  return value.trim().length > 0;
}

function getProfileCompletion(
  values: ProfileFormValues,
  t: (key: string) => string
) {
  const fields = [
    { key: "nationality", label: t("Nationality"), ready: isFilled(values.nationality) },
    {
      key: "current_country",
      label: t("Current country"),
      ready: isFilled(values.current_country)
    },
    {
      key: "target_country",
      label: t("Target country"),
      ready: isFilled(values.target_country)
    },
    {
      key: "relocation_timeline",
      label: t("Relocation timeline"),
      ready: values.relocation_timeline !== ""
    },
    {
      key: "profession",
      label: t("Profession"),
      ready: isFilled(values.profession)
    },
    {
      key: "years_of_experience",
      label: t("Years of experience"),
      ready: isFilled(values.years_of_experience)
    },
    {
      key: "education_level",
      label: t("Education level"),
      ready: values.education_level !== ""
    },
    {
      key: "english_level",
      label: t("English level"),
      ready: values.english_level !== ""
    },
    {
      key: "available_capital",
      label: t("Available capital"),
      ready: isFilled(values.available_capital)
    }
  ];

  const completed = fields.filter((field) => field.ready).length;
  const percent = Math.round((completed / fields.length) * 100);

  return {
    completed,
    missing: fields.filter((field) => !field.ready).map((field) => field.label),
    percent,
    total: fields.length
  };
}

function ProfilePageSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card className="h-80 animate-pulse p-6" key={index} />
        ))}
      </div>
      <div className="space-y-6">
        <Card className="h-72 animate-pulse p-6" />
        <Card className="h-48 animate-pulse p-6" />
      </div>
    </div>
  );
}

function FeedbackBanner({
  message,
  tone
}: Readonly<{ message: string; tone: "success" | "error" }>) {
  const palette =
    tone === "success"
      ? "border-green/20 bg-green/10 text-green"
      : "border-red/20 bg-red/5 text-red";

  return (
    <div className={`rounded-xl border px-4 py-4 text-sm ${palette}`}>
      <p className="font-medium leading-7">{message}</p>
    </div>
  );
}

function ProfileSection({
  children,
  description,
  title
}: Readonly<{
  children: ReactNode;
  description: string;
  title: string;
}>) {
  return (
    <Card className="p-6 md:p-7">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
          {title}
        </p>
        <p className="mt-3 text-sm leading-7 text-muted">{description}</p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">{children}</div>
    </Card>
  );
}

function DesktopDashboardProfilePage() {
  const t = useTranslations();
  const {
    feedback,
    fieldErrors,
    formValues,
    handleFieldChange,
    isDirty,
    isSaving,
    loadError,
    profile,
    refresh,
    save,
    status
  } = useProfileForm();

  const completion = useMemo(() => getProfileCompletion(formValues, t), [formValues, t]);
  const lastUpdated = formatTimestamp(profile?.updated_at);

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        actions={
          <Button
            disabled={status === "loading" || isSaving}
            onClick={() => {
              void refresh();
            }}
            type="button"
            variant="secondary"
          >
            {t("Refresh profile")}
          </Button>
        }
        description={t("Maintain the factors that drive immigration scoring, pathway recommendations, and downstream expert handoff")}
        eyebrow={t("Profile")}
        title={t("Immigration profile control panel")}
      />

      {feedback ? (
        <FeedbackBanner message={feedback.message} tone={feedback.tone} />
      ) : null}

      {status === "loading" ? <ProfilePageSkeleton /> : null}
      {status === "error" && loadError ? (
        <DashboardErrorState
          message={loadError}
          onRetry={() => void refresh()}
          title={t("The immigration profile could not be loaded")}
        />
      ) : null}

      {status === "ready" ? (
        <form
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
          noValidate
          onSubmit={save}
        >
          <div className="space-y-6">
            <ProfileSection
              description={t("Identity and household details help narrow pathway eligibility and relocation constraints")}
              title={t("Personal")}
            >
              <Input
                autoComplete="given-name"
                error={fieldErrors.first_name}
                label={t("First name")}
                onChange={(event) =>
                  handleFieldChange("first_name", event.target.value)
                }
                placeholder="Aylin"
                value={formValues.first_name}
              />
              <Input
                autoComplete="family-name"
                error={fieldErrors.last_name}
                label={t("Last name")}
                onChange={(event) =>
                  handleFieldChange("last_name", event.target.value)
                }
                placeholder="Demir"
                value={formValues.last_name}
              />
              <Input
                error={fieldErrors.nationality}
                label={t("Nationality")}
                onChange={(event) =>
                  handleFieldChange("nationality", event.target.value)
                }
                placeholder="Turkish"
                value={formValues.nationality}
              />
              <Input
                error={fieldErrors.current_country}
                label={t("Current country")}
                onChange={(event) =>
                  handleFieldChange("current_country", event.target.value)
                }
                placeholder="Canada"
                value={formValues.current_country}
              />
              <Select
                error={fieldErrors.marital_status}
                label={t("Marital status")}
                onChange={(event) =>
                  handleFieldChange("marital_status", event.target.value)
                }
                placeholder={t("Select marital status")}
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
                helperText={t("Use 0 if no dependent children are expected in the plan")}
                inputMode="numeric"
                label={t("Children count")}
                onChange={(event) =>
                  handleFieldChange("children_count", event.target.value)
                }
                placeholder="0"
                value={formValues.children_count}
              />
              <Input
                error={fieldErrors.preferred_language}
                helperText={t("Preferred language for platform guidance and any later expert coordination")}
                label={t("Preferred language")}
                onChange={(event) =>
                  handleFieldChange("preferred_language", event.target.value)
                }
                placeholder="en"
                value={formValues.preferred_language}
              />
            </ProfileSection>

            <ProfileSection
              description={t("Destination intent and timeline determine which strategy paths and action plans appear first")}
              title={t("Immigration goals")}
            >
              <Input
                error={fieldErrors.target_country}
                label={t("Target country")}
                onChange={(event) =>
                  handleFieldChange("target_country", event.target.value)
                }
                placeholder="United States"
                value={formValues.target_country}
              />
              <Select
                error={fieldErrors.relocation_timeline}
                label={t("Relocation timeline")}
                onChange={(event) =>
                  handleFieldChange("relocation_timeline", event.target.value)
                }
                placeholder={t("Select timeline")}
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
                helperText={t("Previous refusals can materially affect pathway recommendations")}
                label={t("Prior visa refusal")}
                onChange={(event) =>
                  handleFieldChange(
                    "prior_visa_refusal_flag",
                    event.target.value
                  )
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
                helperText={t("Compliance disclosures are required for accurate strategy screening")}
                label={t("Criminal record")}
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
            </ProfileSection>

            <ProfileSection
              description={t("Professional qualifications shape program fit, score weighting, and evidence collection priorities")}
              title={t("Professional background")}
            >
              <Input
                error={fieldErrors.profession}
                label={t("Profession")}
                onChange={(event) =>
                  handleFieldChange("profession", event.target.value)
                }
                placeholder={t("Software engineer")}
                value={formValues.profession}
              />
              <Input
                error={fieldErrors.years_of_experience}
                inputMode="numeric"
                label={t("Years of experience")}
                onChange={(event) =>
                  handleFieldChange("years_of_experience", event.target.value)
                }
                placeholder="8"
                value={formValues.years_of_experience}
              />
              <Select
                error={fieldErrors.education_level}
                label={t("Education level")}
                onChange={(event) =>
                  handleFieldChange("education_level", event.target.value)
                }
                placeholder={t("Select education level")}
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
                label={t("English level")}
                onChange={(event) =>
                  handleFieldChange("english_level", event.target.value)
                }
                placeholder={t("Select English level")}
                value={formValues.english_level}
              >
                {englishLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </ProfileSection>

            <ProfileSection
              description={t("Financial readiness feeds program affordability checks and later document gathering requirements")}
              title={t("Financial readiness")}
            >
              <Input
                error={fieldErrors.available_capital}
                helperText={t("Enter a gross liquid-capital estimate without currency symbols")}
                inputMode="decimal"
                label={t("Available capital")}
                onChange={(event) =>
                  handleFieldChange("available_capital", event.target.value)
                }
                placeholder="75000.00"
                value={formValues.available_capital}
              />
            </ProfileSection>
          </div>

          <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Card className="p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                {t("Profile readiness")}
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
                {completion.percent}%
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted">
                {completion.completed} {t("of")} {completion.total} {t("key strategy inputs are currently captured")}
              </p>

              <Button
                className="mt-6"
                disabled={!isDirty || isSaving}
                fullWidth
                size="lg"
                type="submit"
              >
                {isSaving
                  ? t("Saving profile")
                  : isDirty
                    ? t("Save profile")
                    : t("No changes to save")}
              </Button>

              <div className="mt-6 rounded-xl border border-line bg-canvas/50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  {t("Last synced")}
                </p>
                <p className="mt-2 text-sm text-ink">
                  {lastUpdated ?? t("Profile not saved yet")}
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                {t("Recommended next inputs")}
              </p>
              {completion.missing.length > 0 ? (
                <ul className="mt-4 space-y-3 text-sm text-muted">
                  {completion.missing.slice(0, 4).map((item) => (
                    <li
                      className="rounded-2xl border border-line bg-canvas/50 px-4 py-3"
                      key={item}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm leading-7 text-muted">
                  {t("Core strategy inputs are in place — the scoring engine can work with this profile foundation")}
                </p>
              )}
            </Card>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function DashboardProfilePage() {
  const isMobile = useIsMobile();

  return isMobile ? <MobileDashboardProfilePage /> : <DesktopDashboardProfilePage />;
}
