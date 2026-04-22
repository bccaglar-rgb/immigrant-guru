"use client";

import { useTranslations } from "next-intl";

import { Animate } from "@/components/ui/animate";
import { CountrySelect } from "@/components/ui/country-select";
import { Input } from "@/components/ui/input";
import { PillSelector } from "@/components/onboarding/pill-selector";
import { StepperInput } from "@/components/onboarding/stepper-input";
import { maritalStatusOptions } from "@/types/profile";
import type { ProfileFormField, ProfileFormValues } from "@/types/profile";

type PersonalStepProps = {
  formValues: ProfileFormValues;
  onChange: (field: ProfileFormField, value: string) => void;
};

export function PersonalStep({ formValues, onChange }: PersonalStepProps) {
  const t = useTranslations();
  return (
    <div className="space-y-8">
      <Animate animation="fade-up" duration={600}>
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">{t("Step 1 of 4")}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
            {t("Who are you?")}
          </h2>
          <p className="mt-2 text-muted">{t("Tell us a bit about yourself.")}</p>
        </div>
      </Animate>

      <div className="mx-auto max-w-lg space-y-5">
        <Animate animation="fade-up" delay={100} duration={500}>
          <CountrySelect
            label={t("Nationality")}
            value={formValues.nationality}
            onChange={(name) => onChange("nationality", name)}
            placeholder={t("Select your nationality")}
          />
        </Animate>

        <Animate animation="fade-up" delay={200} duration={500}>
          <CountrySelect
            label={t("Where do you live now?")}
            value={formValues.current_country}
            onChange={(name) => onChange("current_country", name)}
            placeholder={t("Select current country")}
          />
        </Animate>

        <Animate animation="fade-up" delay={300} duration={500}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">{t("Relationship status")}</p>
            <PillSelector
              options={maritalStatusOptions}
              value={formValues.marital_status}
              onChange={(v) => onChange("marital_status", v)}
            />
          </div>
        </Animate>

        <Animate animation="fade-up" delay={400} duration={500}>
          <StepperInput
            label={t("Children")}
            value={formValues.children_count ? Number(formValues.children_count) : 0}
            onChange={(v) => onChange("children_count", String(v))}
            max={10}
          />
        </Animate>

        <Animate animation="fade-up" delay={500} duration={500}>
          <Input
            label={t("Preferred language")}
            placeholder={t("e.g. English, Turkish...")}
            value={formValues.preferred_language}
            onChange={(e) => onChange("preferred_language", e.target.value)}
          />
        </Animate>
      </div>
    </div>
  );
}
