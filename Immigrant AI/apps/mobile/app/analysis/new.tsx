import { LinearGradient } from "@/lib/linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from "react-native-svg";

import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Country list ────────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: "BEST", flag: "🌍", name: "Best match (recommended)" },
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
] as const;

type Country = (typeof COUNTRIES)[number];

// ── Loading sequence ────────────────────────────────────────────────────────

const LOADING_STEPS = [
  "Reading your profile…",
  "Scanning 47 visa pathways…",
  "Matching against your country fit…",
  "Building Plan A…",
  "Building Plan B…",
  "Finalizing your roadmap…",
];

export default function NewAnalysisScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const isPaid = Boolean(user?.plan && user.plan !== "free");

  // No pre-selection on mount: the user always taps "Choose a country"
  // first, picks one in the bottom sheet, and that single tap kicks off
  // the analysis. Picking "Best match" submits with target_country=null.
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasSelectedCountry = selectedCountry !== null && selectedCountry.code !== "BEST";
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Free users hit the paywall before seeing the analysis form. Paywall
  // bounces them back here on successful purchase via redirectTo.
  useEffect(() => {
    if (user && !isPaid) {
      router.replace("/paywall?redirectTo=/analysis/new" as never);
    }
  }, [user, isPaid]);

  // Walk through loading copy while the API call is in flight, looping
  // through the steps until we either land or error.
  useEffect(() => {
    if (!loading) return;
    setLoadingStep(0);
    const id = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 2200);
    return () => clearInterval(id);
  }, [loading]);

  if (!user || !isPaid) return null;

  const startAnalysis = async (country: Country) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setLoading(true);
    setError(null);
    const targetCountry = country.code === "BEST" ? undefined : country.name;
    const res = await api.post<{ id: string }>("/ai/strategy", {
      target_country: targetCountry,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    router.replace(`/analysis/${res.data.id}` as never);
  };

  if (loading) return <LoadingScreen step={loadingStep} />;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Backdrop />

      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {/* Top bar — close + step indicator */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: 12,
          }}
        >
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
            <CloseIcon />
          </Pressable>
          <StepIndicator current={1} total={3} />
          <View style={{ width: 30 }} />
        </View>

        {/* Marketing scroll body — CTA is pinned outside this. */}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero — value prop first */}
          <View style={{ alignItems: "center", marginTop: 12 }}>
            <BrainSeal />
            <Animated.Text
              entering={FadeInUp.duration(700).delay(120).springify().damping(18)}
              style={{
                marginTop: 24,
                color: "#fff",
                fontSize: 36,
                fontWeight: "700",
                letterSpacing: -1.4,
                lineHeight: 40,
                textAlign: "center",
              }}
            >
              Find your best{"\n"}visa path.
            </Animated.Text>
            <Animated.Text
              entering={FadeInUp.duration(700).delay(240).springify().damping(18)}
              style={{
                marginTop: 14,
                color: "rgba(255,255,255,0.7)",
                fontSize: 16,
                lineHeight: 23,
                textAlign: "center",
                maxWidth: 320,
              }}
            >
              We analyze 47 visa programs and rank your top 3 options by success probability.
            </Animated.Text>
          </View>

          {/* Destination picker — centered, premium pill. Empty state asks
              the user a clear question instead of leading with a generic
              "Best match" placeholder. */}
          <Animated.View
            entering={FadeInUp.duration(700).delay(360).springify().damping(20)}
            style={{ marginTop: 36, alignItems: "center" }}
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.55)",
                fontSize: 13,
                marginBottom: 14,
                textAlign: "center",
              }}
            >
              Where do you want to go?
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                setPickerOpen(true);
              }}
              style={({ pressed }) => ({
                alignSelf: "center",
                paddingVertical: 14,
                paddingLeft: hasSelectedCountry ? 18 : 22,
                paddingRight: 18,
                borderRadius: 999,
                backgroundColor: hasSelectedCountry ? "rgba(255,255,255,0.08)" : "#0a84ff",
                borderWidth: 1,
                borderColor: hasSelectedCountry ? "rgba(255,255,255,0.16)" : "transparent",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                shadowColor: "#0a84ff",
                shadowOffset: { width: 0, height: hasSelectedCountry ? 4 : 10 },
                shadowOpacity: hasSelectedCountry ? 0.15 : 0.42,
                shadowRadius: hasSelectedCountry ? 12 : 20,
                elevation: hasSelectedCountry ? 3 : 6,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              {hasSelectedCountry ? (
                <Text style={{ fontSize: 22 }}>{selectedCountry.flag}</Text>
              ) : null}
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: "600",
                  letterSpacing: -0.2,
                }}
                numberOfLines={1}
              >
                {hasSelectedCountry ? selectedCountry.name : "Choose a country"}
              </Text>
              <Svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke={hasSelectedCountry ? "rgba(255,255,255,0.55)" : "#fff"}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M6 9l6 6 6-6" />
              </Svg>
            </Pressable>
          </Animated.View>

          {/* Inline error appears under the picker if /ai/strategy fails. */}
          {error ? (
            <View
              style={{
                marginTop: 18,
                padding: 12,
                borderRadius: 12,
                backgroundColor: "rgba(255,69,58,0.12)",
                borderWidth: 1,
                borderColor: "rgba(255,69,58,0.25)",
                marginHorizontal: 8,
              }}
            >
              <Text style={{ color: "#ff453a", fontSize: 13, textAlign: "center" }}>{error}</Text>
            </View>
          ) : null}

          {/* Bottom microcopy — sets expectation but no second button. */}
          <View style={{ marginTop: 36, alignItems: "center" }}>
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center" }}>
              Pick a country to start.{"\n"}
              Takes 15 seconds · No commitment.
            </Text>
          </View>

          <View style={{ height: insets.bottom + 12 }} />
        </ScrollView>
      </SafeAreaView>

      <CountryPicker
        visible={pickerOpen}
        selected={selectedCountry}
        onSelect={(c) => {
          // The picker IS the start button — closing it kicks off the
          // analysis with whatever country the user just tapped.
          setSelectedCountry(c);
          setPickerOpen(false);
          // Tiny delay so the user sees the sheet collapse before the
          // loading screen takes over.
          setTimeout(() => startAnalysis(c), 220);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "600", letterSpacing: 1.2, textTransform: "uppercase" }}>
        Step {current} of {total}
      </Text>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i + 1 <= current ? "#7ab8ff" : "rgba(255,255,255,0.18)",
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ── Loading screen ──────────────────────────────────────────────────────────

function LoadingScreen({ step }: { step: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Backdrop />
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <BrainSeal large />
        <Text
          style={{
            marginTop: 36,
            color: "#fff",
            fontSize: 36,
            fontWeight: "700",
            letterSpacing: -1.4,
            textAlign: "center",
            lineHeight: 42,
          }}
        >
          Analyzing.
        </Text>
        <View style={{ marginTop: 28, gap: 10, alignItems: "center" }}>
          {LOADING_STEPS.map((label, i) => (
            <Text
              key={label}
              style={{
                color: i <= step ? "#fff" : "rgba(255,255,255,0.32)",
                fontSize: 16,
                lineHeight: 22,
                textAlign: "center",
                fontWeight: i === step ? "600" : "400",
              }}
            >
              {i < step ? "✓ " : i === step ? "→ " : "   "}
              {label}
            </Text>
          ))}
        </View>
        <Text
          style={{
            position: "absolute",
            bottom: 32,
            color: "rgba(255,255,255,0.45)",
            fontSize: 12,
          }}
        >
          Don't close the app.
        </Text>
      </SafeAreaView>
    </View>
  );
}

// ── Country picker (bottom sheet) ────────────────────────────────────────────

function CountryPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: Country | null;
  onSelect: (c: Country) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  // Reset search every time the sheet opens
  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <TouchableWithoutFeedback>
            <View
              style={{
                backgroundColor: "#fff",
                borderTopLeftRadius: 32,
                borderTopRightRadius: 32,
                paddingBottom: insets.bottom + 12,
                maxHeight: "85%",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -8 },
                shadowOpacity: 0.25,
                shadowRadius: 30,
                elevation: 16,
              }}
            >
              {/* Drag handle */}
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 6 }}>
                <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: "#e5e7eb" }} />
              </View>

              {/* Title */}
              <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 }}>
                <Text style={{ fontSize: 22, fontWeight: "700", color: "#000", letterSpacing: -0.6 }}>
                  Where do you want to go?
                </Text>
                <Text style={{ marginTop: 4, fontSize: 13, color: "#86868b" }}>
                  Tap a country to start your analysis.
                </Text>
              </View>

              {/* Search */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginHorizontal: 20,
                  marginTop: 8,
                  marginBottom: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
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
                  placeholder="Search country…"
                  placeholderTextColor="#c7c7cc"
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  style={{ flex: 1, fontSize: 15, color: "#000", padding: 0 }}
                />
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {filtered.map((c, i) => {
                  const isSelected = selected?.code === c.code;
                  const isBest = c.code === "BEST";
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        onSelect(c);
                      }}
                      android_ripple={{ color: "#f2f2f7" }}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 22,
                        paddingVertical: 16,
                        backgroundColor: pressed ? "#eff6ff" : isSelected ? "#eff6ff" : "#fff",
                        borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                        borderBottomColor: "#f3f4f6",
                      })}
                    >
                      <Text style={{ fontSize: 28, marginRight: 16 }}>{c.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "600",
                            color: isSelected ? "#0a84ff" : "#000",
                            letterSpacing: -0.2,
                          }}
                        >
                          {isBest ? "Best match" : c.name}
                        </Text>
                        {isBest ? (
                          <Text style={{ fontSize: 12, color: "#86868b", marginTop: 2 }}>
                            Let AI pick the country with the highest fit.
                          </Text>
                        ) : null}
                      </View>
                      {isSelected ? (
                        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M5 13l4 4L19 7" />
                        </Svg>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Decorative pieces ────────────────────────────────────────────────────────

function Backdrop() {
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <LinearGradient
        colors={["#000000", "#040b1f", "#0a1838", "#0e2554"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Svg width="100%" height="100%" style={{ position: "absolute", top: -100 }} pointerEvents="none">
        <Defs>
          <RadialGradient id="analysis-orb" cx="50%" cy="20%" r="60%">
            <Stop offset="0%" stopColor="#5e9bff" stopOpacity="0.42" />
            <Stop offset="55%" stopColor="#0a84ff" stopOpacity="0.12" />
            <Stop offset="100%" stopColor="#0a84ff" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50%" cy="20%" r="80%" fill="url(#analysis-orb)" />
      </Svg>
    </View>
  );
}

function BrainSeal({ large = false }: { large?: boolean }) {
  const scale = useSharedValue(0.85);
  const rotate = useSharedValue(0);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.9, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    rotate.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1, false);
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));
  const size = large ? 124 : 92;
  return (
    <Animated.View
      style={[
        animStyle,
        {
          width: size,
          height: size,
          borderRadius: size / 3.2,
          backgroundColor: "#0a84ff",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#0a84ff",
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.55,
          shadowRadius: 28,
          elevation: 12,
        },
      ]}
    >
      <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 4.5 17V14a2.5 2.5 0 0 1 0-5V7a2.5 2.5 0 0 1 2.5-2.5A2.5 2.5 0 0 1 9.5 2z" />
        <Path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44A2.5 2.5 0 0 0 19.5 17V14a2.5 2.5 0 0 0 0-5V7a2.5 2.5 0 0 0-2.5-2.5A2.5 2.5 0 0 0 14.5 2z" />
      </Svg>
    </Animated.View>
  );
}

function CloseIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round">
      <Path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}
