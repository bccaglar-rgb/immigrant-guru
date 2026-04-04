"use client";

import { Animate } from "@/components/ui/animate";
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
  return (
    <div className="space-y-8">
      <Animate animation="fade-up" duration={600}>
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Step 1 of 4</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">
            Who are you?
          </h2>
          <p className="mt-2 text-muted">Tell us a bit about yourself.</p>
        </div>
      </Animate>

      <div className="mx-auto max-w-lg space-y-5">
        <Animate animation="fade-up" delay={100} duration={500}>
          <Input
            label="Nationality"
            placeholder="e.g. Turkish, Brazilian, Indian..."
            value={formValues.nationality}
            onChange={(e) => onChange("nationality", e.target.value)}
          />
        </Animate>

        <Animate animation="fade-up" delay={200} duration={500}>
          <Input
            label="Where do you live now?"
            placeholder="e.g. Istanbul, Sao Paulo, Mumbai..."
            value={formValues.current_country}
            onChange={(e) => onChange("current_country", e.target.value)}
          />
        </Animate>

        <Animate animation="fade-up" delay={300} duration={500}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink/80">Relationship status</p>
            <PillSelector
              options={maritalStatusOptions}
              value={formValues.marital_status}
              onChange={(v) => onChange("marital_status", v)}
            />
          </div>
        </Animate>

        <Animate animation="fade-up" delay={400} duration={500}>
          <StepperInput
            label="Children"
            value={formValues.children_count ? Number(formValues.children_count) : 0}
            onChange={(v) => onChange("children_count", String(v))}
            max={10}
          />
        </Animate>

        <Animate animation="fade-up" delay={500} duration={500}>
          <Input
            label="Preferred language"
            placeholder="e.g. English, Turkish..."
            value={formValues.preferred_language}
            onChange={(e) => onChange("preferred_language", e.target.value)}
          />
        </Animate>
      </div>
    </div>
  );
}
