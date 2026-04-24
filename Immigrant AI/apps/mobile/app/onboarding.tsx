import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PillSelector } from "@/components/ui/PillSelector";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useAuth } from "@/lib/auth";
import {
  booleanChoiceOptions,
  educationLevelOptions,
  emptyProfileFormValues,
  englishLevelOptions,
  fetchMyProfile,
  maritalStatusOptions,
  profileToForm,
  relocationTimelineOptions,
  updateMyProfile,
  type BooleanChoice,
  type EducationLevel,
  type EnglishLevel,
  type MaritalStatus,
  type ProfileFormValues,
  type RelocationTimeline
} from "@/lib/profile";

const TOTAL = 5;

export default function OnboardingScreen() {
  const user = useAuth((s) => s.user);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<ProfileFormValues>(() => ({ ...emptyProfileFormValues }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetchMyProfile();
      if (res.ok) setValues(profileToForm(res.data));
    })();
  }, []);

  const set = <K extends keyof ProfileFormValues>(k: K, v: ProfileFormValues[K]) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    setError(null);
  };

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    const res = await updateMyProfile(values);
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return false;
    }
    return true;
  }, [values]);

  const goNext = async () => {
    // Save on form steps (1-3). Step 0 is welcome, 4 is complete.
    if (step >= 1 && step <= 3) {
      const saved = await save();
      if (!saved) return;
    }
    setStep((s) => Math.min(s + 1, TOTAL - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const finish = () => router.replace("/(tabs)");

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View className="p-5">
          <ProgressBar step={step + 1} total={TOTAL} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 20, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {step === 0 ? (
            <WelcomeStep firstName={values.first_name || user?.email?.split("@")[0]} />
          ) : step === 1 ? (
            <PersonalStep values={values} set={set} />
          ) : step === 2 ? (
            <GoalsStep values={values} set={set} />
          ) : step === 3 ? (
            <BackgroundStep values={values} set={set} />
          ) : (
            <CompleteStep firstName={values.first_name} />
          )}

          {error ? (
            <View className="rounded-2xl bg-red/10 border border-red/20 p-3">
              <Text className="text-sm text-red">{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View className="p-5 gap-2 border-t border-gray-200 bg-bg">
          <View className="flex-row gap-3">
            {step > 0 && step < TOTAL - 1 ? (
              <View className="flex-1">
                <Button variant="secondary" fullWidth onPress={goBack}>
                  Back
                </Button>
              </View>
            ) : null}
            <View className="flex-1">
              {step === TOTAL - 1 ? (
                <Button fullWidth size="lg" onPress={finish}>
                  Go to dashboard
                </Button>
              ) : (
                <Button fullWidth size="lg" onPress={goNext} loading={saving}>
                  {step === 0 ? "Get started" : "Continue"}
                </Button>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Steps ──────────────────────────────────────────────────────────────────────

function WelcomeStep({ firstName }: { firstName?: string | null }) {
  return (
    <View className="gap-3 pt-6">
      <Text className="text-sm font-semibold uppercase tracking-widest text-accent">
        Welcome
      </Text>
      <Text className="text-4xl font-semibold text-ink leading-tight">
        {firstName ? `Hi ${firstName} —` : "Let's begin —"} {"\n"}build your immigration profile.
      </Text>
      <Text className="text-base text-muted leading-relaxed">
        Five quick steps. We'll use your answers to rank countries, pick visas, and build a
        personalised plan.
      </Text>
    </View>
  );
}

type StepProps = {
  values: ProfileFormValues;
  set: <K extends keyof ProfileFormValues>(k: K, v: ProfileFormValues[K]) => void;
};

function PersonalStep({ values, set }: StepProps) {
  return (
    <View className="gap-4 pt-4">
      <View className="gap-1">
        <Text className="text-2xl font-semibold text-ink">About you</Text>
        <Text className="text-sm text-muted">Tell us a bit about yourself.</Text>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Input label="First name" value={values.first_name} onChangeText={(t) => set("first_name", t)} />
        </View>
        <View className="flex-1">
          <Input label="Last name" value={values.last_name} onChangeText={(t) => set("last_name", t)} />
        </View>
      </View>

      <Input
        label="Nationality"
        value={values.nationality}
        onChangeText={(t) => set("nationality", t)}
        placeholder="e.g. Türkiye"
      />
      <Input
        label="Current country"
        value={values.current_country}
        onChangeText={(t) => set("current_country", t)}
        placeholder="Where do you live now?"
      />

      <PillSelector<MaritalStatus>
        label="Marital status"
        options={maritalStatusOptions}
        value={values.marital_status}
        onChange={(v) => set("marital_status", v)}
      />

      <Input
        label="Number of children"
        value={values.children_count}
        onChangeText={(t) => set("children_count", t.replace(/\D/g, "").slice(0, 2))}
        keyboardType="number-pad"
        placeholder="0"
      />
    </View>
  );
}

function GoalsStep({ values, set }: StepProps) {
  return (
    <View className="gap-4 pt-4">
      <View className="gap-1">
        <Text className="text-2xl font-semibold text-ink">Your goals</Text>
        <Text className="text-sm text-muted">Where are you going, and how fast?</Text>
      </View>

      <Input
        label="Target country"
        value={values.target_country}
        onChangeText={(t) => set("target_country", t)}
        placeholder="Where do you want to go?"
      />

      <PillSelector<RelocationTimeline>
        label="Relocation timeline"
        options={relocationTimelineOptions}
        value={values.relocation_timeline}
        onChange={(v) => set("relocation_timeline", v)}
        columns={1}
      />

      <Input
        label="Preferred language for communication"
        value={values.preferred_language}
        onChangeText={(t) => set("preferred_language", t)}
        placeholder="English"
      />
    </View>
  );
}

function BackgroundStep({ values, set }: StepProps) {
  return (
    <View className="gap-4 pt-4">
      <View className="gap-1">
        <Text className="text-2xl font-semibold text-ink">Background</Text>
        <Text className="text-sm text-muted">Education, experience, and a few flags.</Text>
      </View>

      <PillSelector<EducationLevel>
        label="Education level"
        options={educationLevelOptions}
        value={values.education_level}
        onChange={(v) => set("education_level", v)}
      />

      <Input
        label="Profession"
        value={values.profession}
        onChangeText={(t) => set("profession", t)}
        placeholder="Software Engineer"
      />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Input
            label="Years of experience"
            value={values.years_of_experience}
            onChangeText={(t) => set("years_of_experience", t.replace(/\D/g, "").slice(0, 2))}
            keyboardType="number-pad"
            placeholder="5"
          />
        </View>
        <View className="flex-1">
          <Input
            label="Available capital (USD)"
            value={values.available_capital}
            onChangeText={(t) => set("available_capital", t.replace(/[^\d.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="25000"
          />
        </View>
      </View>

      <PillSelector<EnglishLevel>
        label="English level"
        options={englishLevelOptions}
        value={values.english_level}
        onChange={(v) => set("english_level", v)}
      />

      <PillSelector<BooleanChoice>
        label="Criminal record?"
        options={booleanChoiceOptions}
        value={values.criminal_record_flag}
        onChange={(v) => set("criminal_record_flag", v)}
      />

      <PillSelector<BooleanChoice>
        label="Prior visa refusal?"
        options={booleanChoiceOptions}
        value={values.prior_visa_refusal_flag}
        onChange={(v) => set("prior_visa_refusal_flag", v)}
      />
    </View>
  );
}

function CompleteStep({ firstName }: { firstName?: string }) {
  return (
    <View className="gap-4 pt-10 items-center">
      <View className="w-16 h-16 rounded-full bg-accent/10 items-center justify-center">
        <Text className="text-3xl">✓</Text>
      </View>
      <Text className="text-3xl font-semibold text-ink text-center">
        {firstName ? `Nice work, ${firstName}!` : "Profile saved."}
      </Text>
      <Text className="text-base text-muted text-center leading-relaxed">
        Your profile is ready. We'll use it to run your first AI analysis and rank the best
        countries for you.
      </Text>
    </View>
  );
}
