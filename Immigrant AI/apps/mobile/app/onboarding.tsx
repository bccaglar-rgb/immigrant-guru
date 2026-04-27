import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  SlideInRight,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path } from "react-native-svg";

import {
  educationLevelOptions,
  emptyProfileFormValues,
  englishLevelOptions,
  fetchMyProfile,
  isProfileComplete,
  profileToForm,
  relocationTimelineOptions,
  updateMyProfile,
  type EducationLevel,
  type EnglishLevel,
  type ProfileFormValues,
  type RelocationTimeline,
} from "@/lib/profile";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Languages (top 12, locale codes mirror messages/*.json on web) ───────────

const LANGUAGES: { code: string; flag: string; native: string; en: string }[] = [
  { code: "en", flag: "🇺🇸", native: "English", en: "English" },
  { code: "tr", flag: "🇹🇷", native: "Türkçe", en: "Turkish" },
  { code: "es", flag: "🇪🇸", native: "Español", en: "Spanish" },
  { code: "fr", flag: "🇫🇷", native: "Français", en: "French" },
  { code: "de", flag: "🇩🇪", native: "Deutsch", en: "German" },
  { code: "pt", flag: "🇵🇹", native: "Português", en: "Portuguese" },
  { code: "ar", flag: "🇸🇦", native: "العربية", en: "Arabic" },
  { code: "hi", flag: "🇮🇳", native: "हिन्दी", en: "Hindi" },
  { code: "zh", flag: "🇨🇳", native: "中文", en: "Chinese" },
  { code: "ja", flag: "🇯🇵", native: "日本語", en: "Japanese" },
  { code: "ru", flag: "🇷🇺", native: "Русский", en: "Russian" },
  { code: "ko", flag: "🇰🇷", native: "한국어", en: "Korean" },
];

// ── Countries ────────────────────────────────────────────────────────────────

const COUNTRIES: { code: string; flag: string; name: string }[] = [
  { code: "TR", flag: "🇹🇷", name: "Turkey" },
  { code: "US", flag: "🇺🇸", name: "United States" },
  { code: "CA", flag: "🇨🇦", name: "Canada" },
  { code: "GB", flag: "🇬🇧", name: "United Kingdom" },
  { code: "AU", flag: "🇦🇺", name: "Australia" },
  { code: "DE", flag: "🇩🇪", name: "Germany" },
  { code: "FR", flag: "🇫🇷", name: "France" },
  { code: "NL", flag: "🇳🇱", name: "Netherlands" },
  { code: "ES", flag: "🇪🇸", name: "Spain" },
  { code: "IT", flag: "🇮🇹", name: "Italy" },
  { code: "PT", flag: "🇵🇹", name: "Portugal" },
  { code: "IE", flag: "🇮🇪", name: "Ireland" },
  { code: "CH", flag: "🇨🇭", name: "Switzerland" },
  { code: "SE", flag: "🇸🇪", name: "Sweden" },
  { code: "NO", flag: "🇳🇴", name: "Norway" },
  { code: "DK", flag: "🇩🇰", name: "Denmark" },
  { code: "FI", flag: "🇫🇮", name: "Finland" },
  { code: "AT", flag: "🇦🇹", name: "Austria" },
  { code: "BE", flag: "🇧🇪", name: "Belgium" },
  { code: "PL", flag: "🇵🇱", name: "Poland" },
  { code: "CZ", flag: "🇨🇿", name: "Czech Republic" },
  { code: "GR", flag: "🇬🇷", name: "Greece" },
  { code: "JP", flag: "🇯🇵", name: "Japan" },
  { code: "KR", flag: "🇰🇷", name: "South Korea" },
  { code: "SG", flag: "🇸🇬", name: "Singapore" },
  { code: "AE", flag: "🇦🇪", name: "UAE" },
  { code: "NZ", flag: "🇳🇿", name: "New Zealand" },
  { code: "BR", flag: "🇧🇷", name: "Brazil" },
  { code: "MX", flag: "🇲🇽", name: "Mexico" },
  { code: "AR", flag: "🇦🇷", name: "Argentina" },
  { code: "ZA", flag: "🇿🇦", name: "South Africa" },
  { code: "IN", flag: "🇮🇳", name: "India" },
  { code: "CN", flag: "🇨🇳", name: "China" },
  { code: "RU", flag: "🇷🇺", name: "Russia" },
  { code: "EG", flag: "🇪🇬", name: "Egypt" },
  { code: "SA", flag: "🇸🇦", name: "Saudi Arabia" },
  { code: "IL", flag: "🇮🇱", name: "Israel" },
  { code: "TH", flag: "🇹🇭", name: "Thailand" },
  { code: "MY", flag: "🇲🇾", name: "Malaysia" },
  { code: "ID", flag: "🇮🇩", name: "Indonesia" },
  { code: "PH", flag: "🇵🇭", name: "Philippines" },
  { code: "VN", flag: "🇻🇳", name: "Vietnam" },
];

// ── Step type ────────────────────────────────────────────────────────────────

type StepKey =
  | "language"
  | "name"
  | "origin"
  | "destination"
  | "profession"
  | "english"
  | "education"
  | "timeline"
  | "done";

const STEP_ORDER: StepKey[] = [
  "language",
  "name",
  "origin",
  "destination",
  "profession",
  "english",
  "education",
  "timeline",
  "done",
];

// ── Main screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [stepIdx, setStepIdx] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [values, setValues] = useState<ProfileFormValues>(() => ({ ...emptyProfileFormValues }));
  const [loading, setLoading] = useState(false);

  // Hydrate from server. Skip onboarding entirely if already complete.
  useEffect(() => {
    (async () => {
      const res = await fetchMyProfile();
      if (res.ok) {
        if (isProfileComplete(res.data)) {
          router.replace("/(tabs)");
          return;
        }
        setValues(profileToForm(res.data));
      }
      setLoading(false);
    })();
    setLoading(true);
  }, []);

  const step = STEP_ORDER[stepIdx];

  const goNext = useCallback(async (patch?: Partial<ProfileFormValues>) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (patch) {
      const merged = { ...values, ...patch };
      setValues(merged);
      // Save in background — don't block UX on the network round-trip.
      void updateMyProfile(merged).catch(() => undefined);
    }
    setDirection("forward");
    setStepIdx((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  }, [values]);

  const goBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setDirection("back");
    setStepIdx((i) => Math.max(i - 1, 0));
  }, []);

  const finish = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    router.replace("/(tabs)");
  }, []);

  const set = <K extends keyof ProfileFormValues>(k: K, v: ProfileFormValues[K]) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: "#fff" }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {/* Top bar — back + progress */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: 18,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          <BackButton visible={stepIdx > 0 && step !== "done"} onPress={goBack} />
          <ProgressTrack current={stepIdx} total={STEP_ORDER.length - 1 /* "done" not counted */} />
        </View>

        {/* Animated step content */}
        <View key={`${step}-${stepIdx}`} style={{ flex: 1 }}>
          <Animated.View
            entering={
              direction === "forward"
                ? SlideInRight.duration(380).easing(Easing.out(Easing.cubic))
                : FadeIn.duration(220)
            }
            exiting={SlideOutLeft.duration(220)}
            style={{ flex: 1 }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{ flex: 1 }}
              keyboardVerticalOffset={insets.top + 18}
            >
              {step === "language" && <LanguageStep onNext={(v) => goNext({ preferred_language: v })} initial={values.preferred_language} />}
              {step === "name" && <NameStep onNext={(v) => goNext({ first_name: v })} initial={values.first_name} />}
              {step === "origin" && (
                <CountryStep
                  question="Where are you from?"
                  helper="We use this to surface the visa pathways that work for your nationality."
                  initial={values.nationality}
                  onNext={(v, name) => goNext({ nationality: v, current_country: values.current_country || (name ?? "") })}
                />
              )}
              {step === "destination" && (
                <CountryStep
                  question="Where do you want to go?"
                  helper="Pick your top choice. We'll still surface alternatives after the analysis."
                  initial={values.target_country}
                  onNext={(v) => goNext({ target_country: v })}
                />
              )}
              {step === "profession" && (
                <ProfessionStep onNext={(v) => goNext({ profession: v })} initial={values.profession} />
              )}
              {step === "english" && (
                <ChoiceStep
                  question="How is your English?"
                  helper="Be honest — this changes which visas are realistic for you."
                  options={englishLevelOptions.map((o) => ({ value: o.value as EnglishLevel, label: o.label, emoji: ENGLISH_EMOJI[o.value] }))}
                  initial={values.english_level === "" ? null : (values.english_level as EnglishLevel)}
                  onNext={(v) => goNext({ english_level: v as EnglishLevel })}
                />
              )}
              {step === "education" && (
                <ChoiceStep
                  question="Highest education?"
                  helper="Many skilled-worker programs weight this heavily."
                  options={educationLevelOptions.map((o) => ({ value: o.value as EducationLevel, label: o.label, emoji: EDUCATION_EMOJI[o.value] }))}
                  initial={values.education_level === "" ? null : (values.education_level as EducationLevel)}
                  onNext={(v) => goNext({ education_level: v as EducationLevel })}
                />
              )}
              {step === "timeline" && (
                <ChoiceStep
                  question="When do you want to move?"
                  helper="Realistic timelines help us rank fast vs. slow programs."
                  options={relocationTimelineOptions.map((o) => ({ value: o.value as RelocationTimeline, label: o.label, emoji: TIMELINE_EMOJI[o.value] }))}
                  initial={values.relocation_timeline === "" ? null : (values.relocation_timeline as RelocationTimeline)}
                  onNext={(v) => goNext({ relocation_timeline: v as RelocationTimeline })}
                />
              )}
              {step === "done" && <DoneStep firstName={values.first_name} onFinish={finish} />}
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Top bar pieces ───────────────────────────────────────────────────────────

function BackButton({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={{ width: 36, opacity: visible ? 1 : 0 }}
      disabled={!visible}
    >
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 18l-6-6 6-6" />
      </Svg>
    </Pressable>
  );
}

function ProgressTrack({ current, total }: { current: number; total: number }) {
  const widthSv = useSharedValue(0);
  useEffect(() => {
    widthSv.value = withTiming(Math.min(current / total, 1), { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [current, total]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${widthSv.value * 100}%`,
  }));
  return (
    <View style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: "#f2f2f7", overflow: "hidden" }}>
      <Animated.View style={[fillStyle, { height: 6, backgroundColor: "#0a84ff", borderRadius: 999 }]} />
    </View>
  );
}

// ── Language step ────────────────────────────────────────────────────────────

function LanguageStep({ initial, onNext }: { initial: string; onNext: (lang: string) => void }) {
  const [picked, setPicked] = useState<string | null>(initial || null);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Question
        title="What's your language?"
        helper="We'll show your plan in the language you pick."
      />
      <View style={{ marginTop: 28, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {LANGUAGES.map((l) => {
          const isPicked = picked === l.code;
          return (
            <Pressable
              key={l.code}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setPicked(l.code);
                setTimeout(() => onNext(l.code), 220);
              }}
              style={({ pressed }) => ({
                flexBasis: "47%",
                flexGrow: 1,
                padding: 18,
                borderRadius: 22,
                backgroundColor: isPicked ? "#0a84ff" : "#f2f2f7",
                borderWidth: 1.5,
                borderColor: isPicked ? "#0a84ff" : "transparent",
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <Text style={{ fontSize: 32, marginBottom: 6 }}>{l.flag}</Text>
              <Text style={{ fontSize: 17, fontWeight: "700", color: isPicked ? "#fff" : "#000", letterSpacing: -0.3 }}>
                {l.native}
              </Text>
              <Text style={{ fontSize: 12, color: isPicked ? "rgba(255,255,255,0.75)" : "#86868b", marginTop: 2 }}>
                {l.en}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ── Name step ────────────────────────────────────────────────────────────────

function NameStep({ initial, onNext }: { initial: string; onNext: (v: string) => void }) {
  const [name, setName] = useState(initial || "");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const submit = (_e?: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
    const trimmed = name.trim();
    if (trimmed.length < 1) return;
    onNext(trimmed);
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Question title="What should we call you?" helper="Your first name is enough." />
      <TextInput
        ref={inputRef}
        value={name}
        onChangeText={setName}
        placeholder="Burak"
        placeholderTextColor="#c7c7cc"
        returnKeyType="next"
        onSubmitEditing={submit}
        autoCapitalize="words"
        autoCorrect={false}
        style={{
          marginTop: 32,
          fontSize: 36,
          fontWeight: "700",
          color: "#000",
          letterSpacing: -1,
          paddingVertical: 16,
          borderBottomWidth: 2,
          borderBottomColor: "#0a84ff",
        }}
      />
      <ContinueButton disabled={name.trim().length < 1} onPress={submit} />
    </ScrollView>
  );
}

// ── Country step (used for origin + destination) ─────────────────────────────

function CountryStep({
  question,
  helper,
  initial,
  onNext,
}: {
  question: string;
  helper: string;
  initial: string;
  onNext: (countryName: string, code?: string) => void;
}) {
  const [picked, setPicked] = useState<string>(initial || "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickedCountry = useMemo(
    () => COUNTRIES.find((c) => c.name === picked) ?? null,
    [picked]
  );

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Question title={question} helper={helper} />
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          setPickerOpen(true);
        }}
        style={({ pressed }) => ({
          marginTop: 32,
          padding: 24,
          borderRadius: 24,
          backgroundColor: pickedCountry ? "#0a84ff" : "#f2f2f7",
          flexDirection: "row",
          alignItems: "center",
          gap: 18,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <Text style={{ fontSize: 44 }}>{pickedCountry ? pickedCountry.flag : "🌍"}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: pickedCountry ? "rgba(255,255,255,0.75)" : "#86868b", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>
            {pickedCountry ? "Selected" : "Tap to choose"}
          </Text>
          <Text style={{ fontSize: 24, fontWeight: "700", color: pickedCountry ? "#fff" : "#000", letterSpacing: -0.6 }}>
            {pickedCountry ? pickedCountry.name : "Choose a country"}
          </Text>
        </View>
      </Pressable>

      <ContinueButton
        disabled={!pickedCountry}
        onPress={() => pickedCountry && onNext(pickedCountry.name, pickedCountry.code)}
      />

      <CountryPicker
        visible={pickerOpen}
        selected={picked}
        onSelect={(c) => setPicked(c.name)}
        onClose={() => setPickerOpen(false)}
      />
    </ScrollView>
  );
}

function CountryPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string;
  onSelect: (c: { code: string; flag: string; name: string }) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <TouchableWithoutFeedback>
            <View
              style={{
                backgroundColor: "#fff",
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                paddingBottom: insets.bottom + 8,
                maxHeight: "80%",
              }}
            >
              <View style={{ alignItems: "center", paddingTop: 14, paddingBottom: 2 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb" }} />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  margin: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: "#f2f2f7",
                  borderRadius: 14,
                  gap: 10,
                }}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx="11" cy="11" r="8" />
                  <Line x1="21" y1="21" x2="16.65" y2="16.65" />
                </Svg>
                <TextInput
                  placeholder="Search country..."
                  placeholderTextColor="#c7c7cc"
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  style={{ flex: 1, fontSize: 15, color: "#000", padding: 0 }}
                />
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {filtered.map((c, i) => {
                  const isSelected = selected === c.name;
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        onSelect(c);
                        onClose();
                      }}
                      android_ripple={{ color: "#f2f2f7" }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 20,
                        paddingVertical: 14,
                        backgroundColor: isSelected ? "#eff6ff" : "#fff",
                        borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                        borderBottomColor: "#f3f4f6",
                      }}
                    >
                      <Text style={{ fontSize: 24, marginRight: 14 }}>{c.flag}</Text>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 15,
                          fontWeight: isSelected ? "700" : "400",
                          color: isSelected ? "#0a84ff" : "#000",
                        }}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
                {filtered.length === 0 && (
                  <View style={{ padding: 32, alignItems: "center" }}>
                    <Text style={{ fontSize: 14, color: "#86868b" }}>No countries found</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Profession step ──────────────────────────────────────────────────────────

const PROFESSION_QUICK = [
  "Software Engineer",
  "Data Scientist",
  "Designer",
  "Doctor",
  "Nurse",
  "Teacher",
  "Researcher",
  "Founder",
  "Marketer",
  "Lawyer",
  "Accountant",
  "Consultant",
];

function ProfessionStep({ initial, onNext }: { initial: string; onNext: (v: string) => void }) {
  const [text, setText] = useState(initial || "");

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Question title="What do you do?" helper="A short title is enough — we use it to match work-visa programs." />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Software Engineer"
        placeholderTextColor="#c7c7cc"
        returnKeyType="next"
        onSubmitEditing={() => text.trim() && onNext(text.trim())}
        autoCapitalize="words"
        autoCorrect={false}
        style={{
          marginTop: 32,
          fontSize: 28,
          fontWeight: "700",
          color: "#000",
          letterSpacing: -0.6,
          paddingVertical: 14,
          borderBottomWidth: 2,
          borderBottomColor: "#0a84ff",
        }}
      />
      <View style={{ marginTop: 24, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {PROFESSION_QUICK.map((p) => (
          <Pressable
            key={p}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              setText(p);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: text === p ? "#000" : "#f2f2f7",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: text === p ? "#fff" : "#000" }}>{p}</Text>
          </Pressable>
        ))}
      </View>
      <ContinueButton disabled={text.trim().length < 1} onPress={() => onNext(text.trim())} />
    </ScrollView>
  );
}

// ── Choice step (English, Education, Timeline) ───────────────────────────────

const ENGLISH_EMOJI: Record<string, string> = {
  none: "🤷",
  basic: "🌱",
  intermediate: "💬",
  advanced: "🎯",
  fluent: "🌟",
  native: "🏆",
};
const EDUCATION_EMOJI: Record<string, string> = {
  high_school: "🎒",
  vocational: "🔧",
  associate: "📜",
  bachelor: "🎓",
  master: "📚",
  doctorate: "🧑‍🔬",
  other: "🎯",
};
const TIMELINE_EMOJI: Record<string, string> = {
  immediately: "🚀",
  within_3_months: "⚡",
  within_6_months: "📅",
  within_12_months: "🗓️",
  exploring: "🌱",
};

function ChoiceStep<T extends string>({
  question,
  helper,
  options,
  initial,
  onNext,
}: {
  question: string;
  helper: string;
  options: { value: T; label: string; emoji: string }[];
  initial: T | null;
  onNext: (v: T) => void;
}) {
  const [picked, setPicked] = useState<T | null>(initial);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Question title={question} helper={helper} />
      <View style={{ marginTop: 28, gap: 12 }}>
        {options.map((o, i) => {
          const isPicked = picked === o.value;
          return (
            <Animated.View key={o.value} entering={FadeInUp.delay(80 * i).springify().damping(20)}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setPicked(o.value);
                  setTimeout(() => onNext(o.value), 220);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 18,
                  paddingHorizontal: 22,
                  borderRadius: 22,
                  backgroundColor: isPicked ? "#0a84ff" : "#f2f2f7",
                  borderWidth: 1.5,
                  borderColor: isPicked ? "#0a84ff" : "transparent",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <Text style={{ fontSize: 30 }}>{o.emoji}</Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 19,
                    fontWeight: "700",
                    color: isPicked ? "#fff" : "#000",
                    letterSpacing: -0.4,
                  }}
                >
                  {o.label}
                </Text>
                {isPicked && (
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M5 13l4 4L19 7" />
                  </Svg>
                )}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ── Done step ────────────────────────────────────────────────────────────────

function DoneStep({ firstName, onFinish }: { firstName: string; onFinish: () => void }) {
  const scale = useSharedValue(0.7);
  const rotate = useSharedValue(0);
  useEffect(() => {
    scale.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.6)) });
    rotate.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(-8, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, []);
  const sealStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));
  return (
    <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center", alignItems: "center" }}>
      <Animated.View style={[sealStyle, { width: 140, height: 140, borderRadius: 70, backgroundColor: "#0a84ff", alignItems: "center", justifyContent: "center", marginBottom: 36, shadowColor: "#0a84ff", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 24, elevation: 10 }]}>
        <Svg width={70} height={70} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M5 13l4 4L19 7" />
        </Svg>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(200).springify().damping(16)} style={{ fontSize: 44, fontWeight: "700", color: "#000", letterSpacing: -1.5, textAlign: "center", lineHeight: 48 }}>
        {firstName ? `Nice work,${"\n"}${firstName}.` : "Nice work."}
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(360).springify().damping(16)} style={{ marginTop: 16, fontSize: 17, lineHeight: 25, color: "#3a3a3c", textAlign: "center", maxWidth: 320 }}>
        Your profile is ready.{"\n"}Let's see your plan.
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(540).springify().damping(20)} style={{ marginTop: 48 }}>
        <Pressable
          onPress={onFinish}
          style={({ pressed }) => ({
            backgroundColor: "#0a84ff",
            paddingHorizontal: 36,
            paddingVertical: 16,
            borderRadius: 999,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", letterSpacing: -0.2 }}>
            See my dashboard →
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ── Reusable bits ────────────────────────────────────────────────────────────

function Question({ title, helper }: { title: string; helper?: string }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Animated.Text entering={FadeInUp.duration(380).springify().damping(18)} style={{ fontSize: 34, fontWeight: "700", color: "#000", letterSpacing: -1.2, lineHeight: 40 }}>
        {title}
      </Animated.Text>
      {helper ? (
        <Animated.Text entering={FadeInUp.duration(380).delay(80).springify().damping(18)} style={{ marginTop: 10, fontSize: 16, lineHeight: 23, color: "#86868b" }}>
          {helper}
        </Animated.Text>
      ) : null}
    </View>
  );
}

function ContinueButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  return (
    <View style={{ marginTop: 36 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          backgroundColor: disabled ? "#c7c7cc" : "#0a84ff",
          paddingVertical: 16,
          borderRadius: 999,
          alignItems: "center",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", letterSpacing: -0.2 }}>
          Continue
        </Text>
      </Pressable>
    </View>
  );
}
