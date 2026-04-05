"use client";

import { Animate } from "@/components/ui/animate";
import { PillSelector } from "@/components/onboarding/pill-selector";
import { relocationTimelineOptions } from "@/types/profile";
import type { ProfileFormField, ProfileFormValues } from "@/types/profile";

const countryOptions = [
  { label: "United States", value: "United States" },
  { label: "Canada", value: "Canada" },
  { label: "United Kingdom", value: "United Kingdom" },
  { label: "Germany", value: "Germany" },
  { label: "Australia", value: "Australia" },
  { label: "Netherlands", value: "Netherlands" },
] as const;

const timelineDisplayOptions = [
  { label: "ASAP", value: "immediately" },
  { label: "3 months", value: "within_3_months" },
  { label: "6 months", value: "within_6_months" },
  { label: "1 year", value: "within_12_months" },
  { label: "Just exploring", value: "exploring" }
] as const;

const yesNoPills = [
  { label: "No", value: "no" },
  { label: "Yes", value: "yes" },
  { label: "Prefer not to say", value: "unknown" }
] as const;

type GoalsStepProps = {
  formValues: ProfileFormValues;
  onChange: (field: ProfileFormField, value: string) => void;
};

export function GoalsStep({ formValues, onChange }: GoalsStepProps) {
  return (
    <div className="space-y-8">
      <Animate animation="fade-up" duration={600}>
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">Step 2 of 4</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
            Where do you want to go?
          </h2>
          <p className="mt-2 text-muted">Your dream destination and timeline.</p>
        </div>
      </Animate>

      <div className="mx-auto max-w-lg space-y-6">
        <Animate animation="fade-up" delay={100} duration={500}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Where do you want to go?</p>
            <PillSelector
              options={countryOptions}
              value={formValues.target_country}
              onChange={(v) => onChange("target_country", v)}
              columns={3}
            />
          </div>
        </Animate>

        <Animate animation="fade-up" delay={200} duration={500}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">When do you want to move?</p>
            <PillSelector
              options={timelineDisplayOptions}
              value={formValues.relocation_timeline}
              onChange={(v) => onChange("relocation_timeline", v)}
              columns={3}
            />
          </div>
        </Animate>

        <Animate animation="fade-up" delay={300} duration={500}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Have you had a visa refusal before?</p>
            <PillSelector
              options={yesNoPills}
              value={formValues.prior_visa_refusal_flag}
              onChange={(v) => onChange("prior_visa_refusal_flag", v)}
            />
          </div>
        </Animate>

        <Animate animation="fade-up" delay={400} duration={500}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Any criminal record?</p>
            <PillSelector
              options={yesNoPills}
              value={formValues.criminal_record_flag}
              onChange={(v) => onChange("criminal_record_flag", v)}
            />
            <p className="text-xs text-muted mt-1">
              This helps us give accurate recommendations. Your data is private and secure.
            </p>
          </div>
        </Animate>
      </div>
    </div>
  );
}
