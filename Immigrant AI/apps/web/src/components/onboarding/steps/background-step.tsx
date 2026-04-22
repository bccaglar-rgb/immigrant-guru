"use client";

import { useTranslations } from "next-intl";

import { Animate } from "@/components/ui/animate";
import { Input } from "@/components/ui/input";
import { PillSelector } from "@/components/onboarding/pill-selector";
import { StepperInput } from "@/components/onboarding/stepper-input";
import { educationLevelOptions, englishLevelOptions } from "@/types/profile";
import type { ProfileFormField, ProfileFormValues } from "@/types/profile";

const educationDisplay = [
  { label: "High School", value: "high_school" },
  { label: "Vocational", value: "vocational" },
  { label: "Associate", value: "associate" },
  { label: "Bachelor's", value: "bachelor" },
  { label: "Master's", value: "master" },
  { label: "Doctorate", value: "doctorate" }
] as const;

const englishDisplay = [
  { label: "None", value: "none" },
  { label: "Basic", value: "basic" },
  { label: "Intermediate", value: "intermediate" },
  { label: "Advanced", value: "advanced" },
  { label: "Fluent", value: "fluent" },
  { label: "Native", value: "native" }
] as const;

type BackgroundStepProps = {
  formValues: ProfileFormValues;
  onChange: (field: ProfileFormField, value: string) => void;
};

export function BackgroundStep({ formValues, onChange }: BackgroundStepProps) {
  const t = useTranslations();
  return (
    <div className="space-y-8">
      <Animate animation="fade-up" duration={600}>
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">{t("Step 3 of 4")}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
            {t("Your background")}
          </h2>
          <p className="mt-2 text-muted">{t("Professional experience and finances.")}</p>
        </div>
      </Animate>

      <div className="mx-auto max-w-lg space-y-6">
        <Animate animation="fade-up" delay={100} duration={500}>
          <Input
            label={t("What do you do?")}
            placeholder={t("e.g. Software Engineer, Doctor, Designer...")}
            value={formValues.profession}
            onChange={(e) => onChange("profession", e.target.value)}
          />
        </Animate>

        <Animate animation="fade-up" delay={200} duration={500}>
          <StepperInput
            label={t("Years of experience")}
            value={formValues.years_of_experience ? Number(formValues.years_of_experience) : 0}
            onChange={(v) => onChange("years_of_experience", String(v))}
            max={40}
          />
        </Animate>

        <Animate animation="fade-up" delay={300} duration={500}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">{t("Education level")}</p>
            <PillSelector
              options={educationDisplay}
              value={formValues.education_level}
              onChange={(v) => onChange("education_level", v)}
              columns={3}
            />
          </div>
        </Animate>

        <Animate animation="fade-up" delay={400} duration={500}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">{t("English proficiency")}</p>
            <PillSelector
              options={englishDisplay}
              value={formValues.english_level}
              onChange={(v) => onChange("english_level", v)}
              columns={3}
            />
          </div>
        </Animate>

        <Animate animation="fade-up" delay={500} duration={500}>
          <Input
            label={t("Available capital (USD)")}
            placeholder={t("e.g. 50000")}
            value={formValues.available_capital}
            onChange={(e) => onChange("available_capital", e.target.value)}
          />
        </Animate>
      </div>
    </div>
  );
}
