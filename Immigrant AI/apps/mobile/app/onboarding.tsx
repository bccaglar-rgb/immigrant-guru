import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path } from "react-native-svg";

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
  type RelocationTimeline,
} from "@/lib/profile";

// ── Country list ──────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: "TR", flag: "🇹🇷", name: "Turkey" },
  { code: "US", flag: "🇺🇸", name: "United States" },
  { code: "CA", flag: "🇨🇦", name: "Canada" },
  { code: "GB", flag: "🇬🇧", name: "United Kingdom" },
  { code: "AU", flag: "🇦🇺", name: "Australia" },
  { code: "DE", flag: "🇩🇪", name: "Germany" },
  { code: "FR", flag: "🇫🇷", name: "France" },
  { code: "NL", flag: "🇳🇱", name: "Netherlands" },
  { code: "CH", flag: "🇨🇭", name: "Switzerland" },
  { code: "SE", flag: "🇸🇪", name: "Sweden" },
  { code: "NO", flag: "🇳🇴", name: "Norway" },
  { code: "DK", flag: "🇩🇰", name: "Denmark" },
  { code: "AT", flag: "🇦🇹", name: "Austria" },
  { code: "BE", flag: "🇧🇪", name: "Belgium" },
  { code: "IE", flag: "🇮🇪", name: "Ireland" },
  { code: "FI", flag: "🇫🇮", name: "Finland" },
  { code: "PT", flag: "🇵🇹", name: "Portugal" },
  { code: "ES", flag: "🇪🇸", name: "Spain" },
  { code: "IT", flag: "🇮🇹", name: "Italy" },
  { code: "NZ", flag: "🇳🇿", name: "New Zealand" },
  { code: "SG", flag: "🇸🇬", name: "Singapore" },
  { code: "JP", flag: "🇯🇵", name: "Japan" },
  { code: "KR", flag: "🇰🇷", name: "South Korea" },
  { code: "AE", flag: "🇦🇪", name: "UAE" },
  { code: "QA", flag: "🇶🇦", name: "Qatar" },
  { code: "SA", flag: "🇸🇦", name: "Saudi Arabia" },
  { code: "PL", flag: "🇵🇱", name: "Poland" },
  { code: "CZ", flag: "🇨🇿", name: "Czech Republic" },
  { code: "EE", flag: "🇪🇪", name: "Estonia" },
  { code: "LV", flag: "🇱🇻", name: "Latvia" },
  { code: "LT", flag: "🇱🇹", name: "Lithuania" },
  { code: "CY", flag: "🇨🇾", name: "Cyprus" },
  { code: "MT", flag: "🇲🇹", name: "Malta" },
  { code: "GR", flag: "🇬🇷", name: "Greece" },
  { code: "LU", flag: "🇱🇺", name: "Luxembourg" },
  { code: "IS", flag: "🇮🇸", name: "Iceland" },
  { code: "HR", flag: "🇭🇷", name: "Croatia" },
  { code: "MY", flag: "🇲🇾", name: "Malaysia" },
  { code: "TH", flag: "🇹🇭", name: "Thailand" },
  { code: "IL", flag: "🇮🇱", name: "Israel" },
  { code: "ZA", flag: "🇿🇦", name: "South Africa" },
  { code: "BR", flag: "🇧🇷", name: "Brazil" },
  { code: "MX", flag: "🇲🇽", name: "Mexico" },
  { code: "AR", flag: "🇦🇷", name: "Argentina" },
  { code: "IN", flag: "🇮🇳", name: "India" },
  { code: "CN", flag: "🇨🇳", name: "China" },
  { code: "PH", flag: "🇵🇭", name: "Philippines" },
  { code: "NG", flag: "🇳🇬", name: "Nigeria" },
  { code: "GH", flag: "🇬🇭", name: "Ghana" },
  { code: "UA", flag: "🇺🇦", name: "Ukraine" },
  { code: "RU", flag: "🇷🇺", name: "Russia" },
] as const;

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcChevron() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9l6 6 6-6" />
    </Svg>
  );
}
function IcSearch() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="11" cy="11" r="8" />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Svg>
  );
}
function IcXSmall() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round">
      <Path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}
function IcCheck() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 13l4 4L19 7" />
    </Svg>
  );
}

// ── Reusable picker button ────────────────────────────────────────────────────
function PickerButton({
  label,
  displayValue,
  placeholder,
  onPress,
  hasValue,
}: {
  label: string;
  displayValue: string;
  placeholder: string;
  onPress: () => void;
  hasValue: boolean;
}) {
  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
        {label}
      </Text>
      <Pressable onPress={onPress} android_ripple={{ color: "#f3f4f6", borderless: false }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: hasValue ? "#0071e3" : "#e5e7eb",
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 13,
            gap: 10,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 15,
              color: hasValue ? "#111827" : "#9ca3af",
              fontWeight: hasValue ? "500" : "400",
            }}
            numberOfLines={1}
          >
            {hasValue ? displayValue : placeholder}
          </Text>
          <IcChevron />
        </View>
      </Pressable>
    </View>
  );
}

// ── Country picker modal ──────────────────────────────────────────────────────
function CountryPickerModal({
  visible,
  title,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  selected: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const country = COUNTRIES.find((c) => c.name === selected);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <TouchableWithoutFeedback>
            <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: insets.bottom + 8, maxHeight: "82%" }}>

              {/* Handle */}
              <View style={{ alignItems: "center", paddingTop: 12 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb" }} />
              </View>

              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#111827" }}>{title}</Text>
                <Pressable onPress={handleClose} hitSlop={14} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" }}>
                  <IcXSmall />
                </Pressable>
              </View>

              {/* Search */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#f3f4f6", borderRadius: 14 }}>
                <IcSearch />
                <TextInput
                  placeholder="Search…"
                  placeholderTextColor="#9ca3af"
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  style={{ flex: 1, fontSize: 15, color: "#111827", padding: 0 }}
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery("")} hitSlop={10}>
                    <IcXSmall />
                  </Pressable>
                )}
              </View>

              {/* List */}
              <ScrollView showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">
                {filtered.map((c, i) => {
                  const isSelected = selected === c.name;
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        onSelect(c.name);
                        handleClose();
                      }}
                      android_ripple={{ color: "#eff6ff" }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 13, backgroundColor: isSelected ? "#eff6ff" : "#fff", borderBottomWidth: i < filtered.length - 1 ? 1 : 0, borderBottomColor: "#f9fafb" }}>
                        <Text style={{ fontSize: 22, width: 38 }}>{c.flag}</Text>
                        <Text style={{ flex: 1, fontSize: 15, fontWeight: isSelected ? "600" : "400", color: isSelected ? "#0071e3" : "#111827" }}>
                          {c.name}
                        </Text>
                        {isSelected && <IcCheck />}
                      </View>
                    </Pressable>
                  );
                })}
                {filtered.length === 0 && (
                  <View style={{ padding: 40, alignItems: "center" }}>
                    <Text style={{ fontSize: 14, color: "#9ca3af" }}>No countries found</Text>
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

// ── Country picker field ──────────────────────────────────────────────────────
function CountryPickerField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const country = COUNTRIES.find((c) => c.name === value);
  const displayValue = country ? `${country.flag}  ${country.name}` : "";

  return (
    <>
      <PickerButton
        label={label}
        displayValue={displayValue}
        placeholder={placeholder}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          setOpen(true);
        }}
        hasValue={!!value}
      />
      <CountryPickerModal
        visible={open}
        title={label}
        selected={value}
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// ── Number picker field (children count) ─────────────────────────────────────
function NumberPickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const OPTIONS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];

  return (
    <>
      <View>
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
          {label}
        </Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            setOpen(true);
          }}
          android_ripple={{ color: "#f3f4f6", borderless: false }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: value ? "#0071e3" : "#e5e7eb",
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 13,
              gap: 10,
            }}
          >
            <Text style={{ flex: 1, fontSize: 15, color: value ? "#111827" : "#9ca3af", fontWeight: value ? "500" : "400" }}>
              {value ? `${value} ${value === "1" ? "child" : "children"}` : "Select number"}
            </Text>
            <IcChevron />
          </View>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: insets.bottom + 8 }}>
                <View style={{ alignItems: "center", paddingTop: 12 }}>
                  <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb" }} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "#111827" }}>{label}</Text>
                  <Pressable onPress={() => setOpen(false)} hitSlop={14} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" }}>
                    <IcXSmall />
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 16, gap: 10 }}>
                  {OPTIONS.map((opt) => {
                    const isSelected = value === opt || (opt === "0" && !value);
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => undefined);
                          onChange(opt === "0" ? "0" : opt);
                          setOpen(false);
                        }}
                      >
                        <View style={{ width: 70, height: 52, borderRadius: 14, backgroundColor: isSelected ? "#0071e3" : "#f3f4f6", alignItems: "center", justifyContent: "center", borderWidth: isSelected ? 0 : 1, borderColor: "#e5e7eb" }}>
                          <Text style={{ fontSize: 16, fontWeight: "700", color: isSelected ? "#fff" : "#374151" }}>{opt}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

// ── Steps config ──────────────────────────────────────────────────────────────
const TOTAL = 4;
const STEP_TITLES = ["About you", "Your goals", "Background", "Done!"];

// ── Main screen ───────────────────────────────────────────────────────────────
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
    try {
      const res = await updateMyProfile(values);
      if (!res.ok) { setError(res.message); return false; }
      return true;
    } catch {
      setError("Something went wrong. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [values]);

  const goNext = async () => {
    if (step <= 2) {
      const saved = await save();
      if (!saved) return;
    }
    setStep((s) => Math.min(s + 1, TOTAL - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));
  const finish = () => router.replace("/(tabs)");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f5f7" }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
          {step > 0 && step < TOTAL - 1 && (
            <Pressable onPress={goBack} style={{ alignSelf: "flex-start", marginBottom: 8, paddingVertical: 4, paddingHorizontal: 2 }}>
              <Text style={{ color: "#0071e3", fontSize: 15, fontWeight: "600" }}>← Back</Text>
            </Pressable>
          )}
          <ProgressBar step={step + 1} total={TOTAL} label={STEP_TITLES[step]} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {step === 0 ? <PersonalStep values={values} set={set} />
            : step === 1 ? <GoalsStep values={values} set={set} />
            : step === 2 ? <BackgroundStep values={values} set={set} />
            : <CompleteStep firstName={values.first_name} />}

          {error && (
            <View style={{ borderRadius: 16, backgroundColor: "rgba(255,59,48,0.08)", borderWidth: 1, borderColor: "rgba(255,59,48,0.2)", padding: 12 }}>
              <Text style={{ fontSize: 13, color: "#ff3b30" }}>{error}</Text>
            </View>
          )}
        </ScrollView>

        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: "#e5e7eb", backgroundColor: "#f5f5f7" }}>
          {step === TOTAL - 1 ? (
            <Button fullWidth size="lg" onPress={finish}>Go to dashboard</Button>
          ) : (
            <Button fullWidth size="lg" onPress={goNext} loading={saving}>
              {step === TOTAL - 2 ? "Save & finish" : "Continue →"}
            </Button>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────
type StepProps = {
  values: ProfileFormValues;
  set: <K extends keyof ProfileFormValues>(k: K, v: ProfileFormValues[K]) => void;
};

function PersonalStep({ values, set }: StepProps) {
  return (
    <View style={{ gap: 16, paddingTop: 4 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: "#111827" }}>About you</Text>
        <Text style={{ fontSize: 14, color: "#6b7280" }}>Tell us a bit about yourself.</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Input label="First name" value={values.first_name} onChangeText={(t) => set("first_name", t)} />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Last name" value={values.last_name} onChangeText={(t) => set("last_name", t)} />
        </View>
      </View>

      <CountryPickerField
        label="Nationality"
        value={values.nationality}
        placeholder="Select your nationality"
        onChange={(v) => set("nationality", v)}
      />

      <CountryPickerField
        label="Current country"
        value={values.current_country}
        placeholder="Where do you live now?"
        onChange={(v) => set("current_country", v)}
      />

      <PillSelector<MaritalStatus>
        label="Marital status"
        options={maritalStatusOptions}
        value={values.marital_status}
        onChange={(v) => set("marital_status", v)}
      />

      <NumberPickerField
        label="Number of children"
        value={values.children_count}
        onChange={(v) => set("children_count", v)}
      />
    </View>
  );
}

function GoalsStep({ values, set }: StepProps) {
  return (
    <View style={{ gap: 16, paddingTop: 4 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: "#111827" }}>Your goals</Text>
        <Text style={{ fontSize: 14, color: "#6b7280" }}>Where are you going, and how fast?</Text>
      </View>

      <CountryPickerField
        label="Target country"
        value={values.target_country}
        placeholder="Where do you want to move?"
        onChange={(v) => set("target_country", v)}
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
    <View style={{ gap: 16, paddingTop: 4 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: "#111827" }}>Background</Text>
        <Text style={{ fontSize: 14, color: "#6b7280" }}>Education, experience & more.</Text>
      </View>

      <PillSelector<EducationLevel>
        label="Education level"
        options={educationLevelOptions}
        value={values.education_level}
        onChange={(v) => set("education_level", v)}
      />

      <Input label="Profession" value={values.profession} onChangeText={(t) => set("profession", t)} placeholder="Software Engineer" />

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Input
            label="Years of experience"
            value={values.years_of_experience}
            onChangeText={(t) => set("years_of_experience", t.replace(/\D/g, "").slice(0, 2))}
            keyboardType="number-pad"
            placeholder="5"
          />
        </View>
        <View style={{ flex: 1 }}>
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
    <View style={{ gap: 16, paddingTop: 40, alignItems: "center" }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(0,113,227,0.1)", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 34 }}>✓</Text>
      </View>
      <Text style={{ fontSize: 28, fontWeight: "700", color: "#111827", textAlign: "center" }}>
        {firstName ? `Nice work, ${firstName}!` : "Profile saved!"}
      </Text>
      <Text style={{ fontSize: 15, color: "#6b7280", textAlign: "center", lineHeight: 22 }}>
        Your profile is ready. Now run your first AI analysis to see the best countries and visas for you.
      </Text>
    </View>
  );
}
