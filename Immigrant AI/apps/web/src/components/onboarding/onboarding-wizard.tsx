"use client";

import { useCallback, useState } from "react";

import { useAuthSession } from "@/hooks/use-auth-session";
import { useProfileForm } from "@/hooks/use-profile-form";
import { ProgressBar } from "@/components/onboarding/progress-bar";
import { WelcomeStep } from "@/components/onboarding/steps/welcome-step";
import { PersonalStep } from "@/components/onboarding/steps/personal-step";
import { GoalsStep } from "@/components/onboarding/steps/goals-step";
import { BackgroundStep } from "@/components/onboarding/steps/background-step";
import { CompleteStep } from "@/components/onboarding/steps/complete-step";
import { profileFormToUpdatePayload } from "@/lib/profile-client";
import { updateMyProfile } from "@/lib/profile-client";
import { profileFormSchema } from "@/lib/profile-client";
import { Button } from "@/components/ui/button";

const TOTAL_STEPS = 5;

export function OnboardingWizard() {
  const { session, user } = useAuthSession();
  const { formValues, handleFieldChange, loadError, refresh, status } = useProfileForm();
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [saveError, setSaveError] = useState<string | null>(null);

  const firstName = user?.profile?.first_name || user?.email?.split("@")[0] || "";

  const saveProgress = useCallback(async () => {
    if (!session) {
      setSaveError("Your session is no longer available. Sign in again to continue onboarding.");
      return false;
    }

    const validation = profileFormSchema.safeParse(formValues);
    if (!validation.success) {
      setSaveError(
        validation.error.issues[0]?.message ??
          "Review the highlighted profile fields before continuing."
      );
      return false;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      await updateMyProfile(
        session.accessToken,
        profileFormToUpdatePayload(validation.data)
      );
      return true;
    } catch {
      setSaveError(
        "Your profile could not be saved right now. Retry before moving to the next step."
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [session, formValues]);

  const goNext = useCallback(async () => {
    setDirection("forward");
    // Save on steps 1-3 (the form steps)
    if (step >= 1 && step <= 3) {
      const saved = await saveProgress();
      if (!saved) {
        return;
      }
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, [step, saveProgress]);

  const goBack = useCallback(() => {
    setDirection("back");
    setSaveError(null);
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Onboarding could not load
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted">
            {loadError ??
              "The platform could not load your profile draft. Retry before continuing."}
          </p>
          <div className="mt-6">
            <Button onClick={() => void refresh()} size="lg">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const slideClass = direction === "forward"
    ? "animate-slide-up"
    : "animate-slide-up";

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {saveError ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm leading-6 text-red-700">
          {saveError}
        </div>
      ) : null}
      {step > 0 && step < TOTAL_STEPS - 1 && (
        <div className="mb-8">
          <ProgressBar currentStep={step} totalSteps={TOTAL_STEPS - 1} />
        </div>
      )}

      <div key={step} className={slideClass}>
        {step === 0 && (
          <WelcomeStep firstName={firstName} onNext={goNext} />
        )}
        {step === 1 && (
          <PersonalStep formValues={formValues} onChange={handleFieldChange} />
        )}
        {step === 2 && (
          <GoalsStep formValues={formValues} onChange={handleFieldChange} />
        )}
        {step === 3 && (
          <BackgroundStep formValues={formValues} onChange={handleFieldChange} />
        )}
        {step === 4 && (
          <CompleteStep formValues={formValues} />
        )}
      </div>

      {step > 0 && step < TOTAL_STEPS - 1 && (
        <div className="mt-10 flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            className="text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goNext}
              className="text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              Skip
            </button>
            <Button
              onClick={goNext}
              disabled={isSaving}
              size="lg"
            >
              {isSaving ? "Saving..." : step === 3 ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
