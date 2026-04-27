import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "@/lib/linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import {
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient as SvgGradient, Path, Polyline, Rect, Stop } from "react-native-svg";
import type { ReactNode } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { fetchMyProfile, isProfileComplete, profileCompletionPct, readinessScore } from "@/lib/profile";

// ── Inline SVG icons (no font loading needed) ─────────────────────────────────
const IC = { stroke: "#fff", fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function IcDocument({ s = 16, c = "#60a5fa" }: { s?: number; c?: string }) {
  return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><Polyline points="14 2 14 8 20 8" /><Line x1="16" y1="13" x2="8" y2="13" /><Line x1="16" y1="17" x2="8" y2="17" /></Svg>;
}
function IcArrow({ s = 13, c = "#60a5fa" }: { s?: number; c?: string }) {
  return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><Line x1="5" y1="12" x2="19" y2="12" /><Polyline points="12 5 19 12 12 19" /></Svg>;
}
function IcSparkles({ s = 28, c = "#fff" }: { s?: number; c?: string }) {
  return <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" /><Path d="M5 3l.9 2.7L8 6.5l-2.1.8L5 10l-.9-2.7L2 6.5l2.1-.8L5 3z" /><Path d="M19 14l.9 2.7 2.1.8-2.1.8L19 21l-.9-2.7-2.1-.8 2.1-.8L19 14z" /></Svg>;
}
const { width: SCREEN_W } = Dimensions.get("window");
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SIZE = 160;
const RING_R = 62;
const RING_STROKE = 10;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

// ── Small inline score ring (72 × 72) ────────────────────────────────────────
const S_SIZE = 72, S_R = 28, S_STROKE = 5, S_CIRC = 2 * Math.PI * S_R;
function SmallScoreRing({ score, loading }: { score: number | null; loading: boolean }) {
  const progress = useSharedValue(0);
  const pulse = useSharedValue(0.35);
  useEffect(() => {
    if (loading) {
      pulse.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.35, { duration: 700 })), -1, true);
    } else {
      pulse.value = withTiming(0, { duration: 150 });
      progress.value = withDelay(200, withTiming((score ?? 0) / 100, { duration: 1000 }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, score]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: S_CIRC * (1 - progress.value) }));
  const skeletonStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View style={{ width: S_SIZE, height: S_SIZE, alignItems: "center", justifyContent: "center" }}>
      <Svg width={S_SIZE} height={S_SIZE} style={{ position: "absolute" }}>
        <Circle cx={S_SIZE/2} cy={S_SIZE/2} r={S_R} stroke="#e5e7eb" strokeWidth={S_STROKE} fill="none" />
      </Svg>
      <Svg width={S_SIZE} height={S_SIZE} style={{ position: "absolute" }}>
        <Defs>
          <SvgGradient id="smRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0071e3" />
            <Stop offset="100%" stopColor="#5e5ce6" />
          </SvgGradient>
        </Defs>
        <AnimatedCircle cx={S_SIZE/2} cy={S_SIZE/2} r={S_R} stroke="url(#smRingGrad)" strokeWidth={S_STROKE}
          fill="none" strokeLinecap="round" strokeDasharray={S_CIRC} animatedProps={ringProps}
          transform={`rotate(-90 ${S_SIZE/2} ${S_SIZE/2})`} />
      </Svg>
      {loading ? (
        <Animated.View style={[skeletonStyle, { width: 28, height: 14, borderRadius: 6, backgroundColor: "#e5e7eb" }]} />
      ) : (
        <Text style={{ fontSize: 17, fontWeight: "700", color: "#111827" }}>{score ?? "—"}</Text>
      )}
    </View>
  );
}

// ── Smart action banner (adapts to user state) ────────────────────────────────
type BannerVariant = "complete-profile" | "first-analysis";

const BANNER_CONFIG = {
  "complete-profile": {
    colors: ["#ff6b35", "#ff9f0a", "#ffcc02"] as [string, string, string],
    shadowColor: "#ff9f0a",
    glowColor: "#ff9f0a",
    icon: (iconStyle: object) => (
      <Animated.View style={iconStyle}>
        <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
          <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><Circle cx="12" cy="7" r="4" />
          </Svg>
        </View>
      </Animated.View>
    ),
    step: "Step 1 of 2",
    title: "Complete your profile",
    subtitle: "Unlock your Readiness Score & AI analysis.",
    cta: "Let's go →",
    ctaColor: "#ff6b35",
  },
  "first-analysis": {
    colors: ["#0060d0", "#0071e3", "#5e5ce6"] as [string, string, string],
    shadowColor: "#0071e3",
    glowColor: "#0071e3",
    icon: (iconStyle: object) => (
      <Animated.View style={iconStyle}>
        <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
          <IcSparkles s={26} />
        </View>
      </Animated.View>
    ),
    step: "Step 2 of 2",
    title: "Run your first analysis",
    subtitle: "AI ranks countries & visas for your profile.",
    cta: "Start →",
    ctaColor: "#0071e3",
  },
} as const;

function ActionBanner({ variant, onPress, badgeOverride, subtitleOverride }: {
  variant: BannerVariant;
  onPress: () => void;
  badgeOverride?: string;
  subtitleOverride?: string;
}) {
  const cfg = BANNER_CONFIG[variant];
  const stepLabel = badgeOverride ?? cfg.step;
  const subtitleLabel = subtitleOverride ?? cfg.subtitle;
  const scale = useSharedValue(1);
  const iconY = useSharedValue(0);
  const glowOpacity = useSharedValue(0.18);
  const shimmerX = useSharedValue(-SCREEN_W);

  useEffect(() => {
    iconY.value = withRepeat(withSequence(
      withTiming(-6, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      withTiming(0,  { duration: 1400, easing: Easing.inOut(Easing.sin) })
    ), -1, true);
    glowOpacity.value = withRepeat(withSequence(
      withTiming(0.38, { duration: 1800 }),
      withTiming(0.12, { duration: 1800 })
    ), -1, true);
    shimmerX.value = withRepeat(withTiming(SCREEN_W + 80, { duration: 2600, easing: Easing.linear }), -1, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const iconStyle  = useAnimatedStyle(() => ({ transform: [{ translateY: iconY.value }] }));
  const glowStyle  = useAnimatedStyle(() => ({
    shadowOpacity: glowOpacity.value,
    elevation: interpolate(glowOpacity.value, [0.12, 0.38], [6, 18]),
  }));
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmerX.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.delay(60).springify().damping(16)}
      style={[pressStyle, glowStyle, {
        marginHorizontal: 20, marginTop: 16, borderRadius: 24,
        shadowColor: cfg.shadowColor, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24,
      }]}
    >
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 14, stiffness: 380 }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 14, stiffness: 380 }); }}
        onPress={onPress}
        style={{ overflow: "hidden", borderRadius: 24 }}
      >
        <LinearGradient colors={cfg.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ padding: 20, flexDirection: "row", alignItems: "center", gap: 14 }}>

          {/* Shimmer sweep */}
          <Animated.View style={[shimmerStyle, { position: "absolute", top: 0, bottom: 0, width: 80 }]}>
            <LinearGradient
              colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.2)", "rgba(255,255,255,0)"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </Animated.View>

          {/* Icon */}
          {cfg.icon(iconStyle)}

          {/* Text */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <View style={{ backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#fff", letterSpacing: 0.3 }}>{stepLabel}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff", letterSpacing: -0.2 }}>{cfg.title}</Text>
            <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2, lineHeight: 17 }}>{subtitleLabel}</Text>
          </View>

          {/* CTA */}
          <View style={{ backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 }}>
            <Text style={{ color: cfg.ctaColor, fontSize: 13, fontWeight: "700" }}>{cfg.cta}</Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

type DashboardPayload = {
  score?: { value: number; label: string } | null;
  recentAnalysis?: { id: string; title: string; createdAt: string } | null;
  recommendations?: Array<{ country: string; visa: string; fit: number }>;
};

// ── Greeting helpers ─────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return { text: "Good night", emoji: "🌙" };
  if (h < 12) return { text: "Good morning", emoji: "☀️" };
  if (h < 17) return { text: "Good afternoon", emoji: "🌤️" };
  return { text: "Good evening", emoji: "🌙" };
}

// ── Pressable card with spring scale ─────────────────────────────────────────
function PressCard({
  children,
  onPress,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  delay?: number;
  style?: object;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify().damping(18)}
      style={[animStyle, style]}
    >
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 400 });
        }}
        onPress={onPress}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ── Circular score ring ───────────────────────────────────────────────────────
function ScoreRing({ score, loading }: { score: number | null; loading: boolean }) {
  const progress = useSharedValue(0);
  const displayScore = useSharedValue(0);
  const pulseOpacity = useSharedValue(0.4);
  const scoreRef = useRef(0);

  const hapticFired = useRef(false);

  function fireSuccessHaptic() {
    if (!hapticFired.current) {
      hapticFired.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
  }

  useEffect(() => {
    if (loading) {
      // Pulse skeleton while loading
      pulseOpacity.value = withRepeat(
        withSequence(withTiming(1, { duration: 800 }), withTiming(0.4, { duration: 800 })),
        -1,
        true
      );
    } else {
      pulseOpacity.value = withTiming(0, { duration: 200 });
      const target = score ?? 0;
      progress.value = withDelay(
        200,
        withTiming(target / 100, { duration: 1200 }, (finished) => {
          if (finished) runOnJS(fireSuccessHaptic)();
        })
      );
      displayScore.value = withDelay(200, withTiming(target, { duration: 1200 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, score]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.value),
  }));

  const skeletonStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: RING_SIZE, height: RING_SIZE }}>
      {/* Background ring */}
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: "absolute" }}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          stroke="#e5e7eb"
          strokeWidth={RING_STROKE}
          fill="none"
        />
      </Svg>

      {/* Gradient definition + animated foreground ring */}
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: "absolute" }}>
        <Defs>
          <SvgGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0071e3" />
            <Stop offset="100%" stopColor="#5e5ce6" />
          </SvgGradient>
        </Defs>
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          stroke="url(#ringGrad)"
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          animatedProps={ringProps}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>

      {/* Center content */}
      {loading ? (
        <Animated.View style={[skeletonStyle, { alignItems: "center" }]}>
          <View style={{ width: 52, height: 36, borderRadius: 8, backgroundColor: "#e5e7eb" }} />
          <View style={{ width: 36, height: 14, borderRadius: 6, backgroundColor: "#e5e7eb", marginTop: 4 }} />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.delay(600)} style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 40, fontWeight: "700", color: "#111827", letterSpacing: -1 }}>
            {score ?? "—"}
          </Text>
          <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>/ 100</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ── Country card (horizontal scroll) ─────────────────────────────────────────
const COUNTRY_COLORS: [string, string][] = [
  ["#0071e3", "#5e5ce6"],
  ["#5e5ce6", "#bf5af2"],
  ["#30d158", "#0071e3"],
  ["#ff9f0a", "#ff6b35"],
];

function CountryCard({
  country,
  visa,
  fit,
  index,
  onPress,
}: {
  country: string;
  visa: string;
  fit: number;
  index: number;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const colors = COUNTRY_COLORS[index % COUNTRY_COLORS.length];

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(300 + index * 80).springify().damping(18)}
      style={animStyle}
    >
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 400 });
        }}
        onPress={onPress}
        style={{ marginRight: 12 }}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 140,
            borderRadius: 20,
            padding: 16,
            paddingBottom: 18,
          }}
        >
          <Text style={{ fontSize: 28, marginBottom: 8 }}>
            {countryFlagEmoji(country)}
          </Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }} numberOfLines={1}>
            {country}
          </Text>
          <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 }} numberOfLines={1}>
            {visa}
          </Text>
          <View
            style={{
              marginTop: 12,
              backgroundColor: "rgba(255,255,255,0.25)",
              borderRadius: 100,
              paddingHorizontal: 10,
              paddingVertical: 4,
              alignSelf: "flex-start",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>{fit}% fit</Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function countryFlagEmoji(country: string): string {
  const flags: Record<string, string> = {
    "Canada": "🇨🇦", "Germany": "🇩🇪", "Australia": "🇦🇺",
    "Netherlands": "🇳🇱", "Portugal": "🇵🇹", "Spain": "🇪🇸",
    "UK": "🇬🇧", "United Kingdom": "🇬🇧", "USA": "🇺🇸",
    "United States": "🇺🇸", "New Zealand": "🇳🇿", "Sweden": "🇸🇪",
    "Norway": "🇳🇴", "Denmark": "🇩🇰", "Switzerland": "🇨🇭",
    "Ireland": "🇮🇪", "France": "🇫🇷", "Italy": "🇮🇹",
    "Japan": "🇯🇵", "Singapore": "🇸🇬", "UAE": "🇦🇪",
    "Turkey": "🇹🇷", "Türkiye": "🇹🇷",
  };
  return flags[country] ?? "🌍";
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const user = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { text: greeting, emoji } = getGreeting();

  // Backend has no /dashboard endpoint yet — keep the shape so the rest of
  // the screen renders correctly with empty defaults instead of throwing.
  const dashboard = {
    data: undefined as DashboardPayload | undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
  };

  const profile = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const res = await fetchMyProfile();
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
  });

  const onRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ["my-profile"] });
  };

  const firstName = profile.data?.first_name || user?.email?.split("@")[0] || "there";
  const isPaid = user?.plan && user.plan !== "free";
  const recs = dashboard.data?.recommendations ?? [];

  const isProfileIncomplete = !isProfileComplete(profile.data);
  const profilePct = profileCompletionPct(profile.data);
  const score = profile.data ? readinessScore(profile.data) : null;
  const scoreLabel = isProfileIncomplete
    ? "Finish your profile to push this higher."
    : "Run an analysis to convert this into a plan.";

  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f7" }}>
      {/* ── Fixed gradient header ── */}
      <LinearGradient
        colors={["#0060d0", "#0071e3", "#1e6db5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 6, paddingBottom: 14, paddingHorizontal: 20 }}
      >
        <Animated.View entering={FadeIn.duration(500)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", fontWeight: "500" }}>
              {greeting} {emoji}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "700", color: "#fff", letterSpacing: -0.3, marginTop: 1 }}>
              {firstName}
            </Text>
          </View>

          {/* Plan badge */}
          <Pressable
            onPress={() => {
              if (!isPaid) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
                router.push("/paywall");
              }
            }}
          >
            {isPaid ? (
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  borderRadius: 100,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.3)",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                  ✦ {(user?.plan ?? "").toUpperCase()}
                </Text>
              </View>
            ) : (
              <LinearGradient
                colors={["#ff9f0a", "#ff6b35"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6 }}
              >
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Upgrade ↑</Text>
              </LinearGradient>
            )}
          </Pressable>
        </Animated.View>
      </LinearGradient>

      {/* ── Scroll content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={dashboard.isFetching || profile.isFetching}
            onRefresh={onRefresh}
            tintColor="#0071e3"
          />
        }
      >
        {/* Smart action banner — Step 1: complete profile, Step 2: run analysis */}
        {!dashboard.isLoading && !profile.isLoading && (() => {
          if (isProfileIncomplete)
            return (
              <ActionBanner
                variant="complete-profile"
                onPress={() => router.push("/onboarding")}
                badgeOverride={`${profilePct}% complete`}
                subtitleOverride={
                  profilePct === 0
                    ? "Tell us about you to unlock your AI analysis."
                    : `${profilePct}% done — finish to unlock your analysis.`
                }
              />
            );
          if (recs.length === 0 && !dashboard.data?.recentAnalysis)
            return <ActionBanner variant="first-analysis" onPress={() => router.push("/analysis/new" as never)} />;
          return null;
        })()}

        {/* Compact score card */}
        <Animated.View
          entering={FadeInDown.delay(100).springify().damping(18)}
          style={{
            marginHorizontal: 20,
            marginTop: 16,
            marginBottom: 0,
            backgroundColor: "#fff",
            borderRadius: 20,
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            shadowColor: "#0071e3",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 16,
            elevation: 3,
          }}
        >
          <SmallScoreRing score={score} loading={profile.isLoading} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#9ca3af", letterSpacing: 0.8, textTransform: "uppercase" }}>
                Readiness Score
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  router.push("/onboarding?edit=1" as never);
                }}
                hitSlop={10}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#0071e3" }}>Edit</Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", marginTop: 2, letterSpacing: -0.3 }}>
              {score !== null ? `${score}` : "—"}
              <Text style={{ fontSize: 12, fontWeight: "400", color: "#9ca3af" }}> / 100</Text>
            </Text>
            <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 2, lineHeight: 16 }} numberOfLines={2}>
              {scoreLabel}
            </Text>
          </View>
          {score !== null && score > 0 && (
            <View style={{ backgroundColor: score >= 70 ? "#ecfdf5" : score >= 40 ? "#eff6ff" : "#fff7ed", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: score >= 70 ? "#059669" : score >= 40 ? "#0071e3" : "#f59e0b" }}>
                {score >= 70 ? "Strong" : score >= 40 ? "Good" : "Low"}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Top country picks */}
        {recs.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Animated.View
              entering={FadeInDown.delay(250).springify().damping(18)}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 14 }}
            >
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#111827" }}>Top picks for you</Text>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  router.push("/(tabs)/best-countries" as never);
                }}
              >
                <Text style={{ fontSize: 13, color: "#0071e3", fontWeight: "600" }}>See all</Text>
              </Pressable>
            </Animated.View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
            >
              {recs.slice(0, 5).map((r, i) => (
                <CountryCard
                  key={`${r.country}-${r.visa}`}
                  country={r.country}
                  visa={r.visa}
                  fit={r.fit}
                  index={i}
                  onPress={() => router.push(`/move-to/${r.country.toLowerCase().replace(/\s+/g, "-")}` as never)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recent analysis */}
        {dashboard.data?.recentAnalysis && (
          <PressCard
            delay={700}
            style={{ marginHorizontal: 20, marginTop: 24 }}
            onPress={() =>
              router.push(`/analysis/${dashboard.data!.recentAnalysis!.id}` as never)
            }
          >
            <LinearGradient
              colors={["#1a1a2e", "#16213e"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 24, padding: 20 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    backgroundColor: "rgba(0,113,227,0.4)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IcDocument />
                </View>
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" }}>
                  Last Analysis
                </Text>
              </View>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#fff" }} numberOfLines={2}>
                {dashboard.data.recentAnalysis.title}
              </Text>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
                {new Date(dashboard.data.recentAnalysis.createdAt).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 14 }}>
                <Text style={{ fontSize: 13, color: "#60a5fa", fontWeight: "600" }}>Continue reading</Text>
                <IcArrow />
              </View>
            </LinearGradient>
          </PressCard>
        )}


      </ScrollView>
    </View>
  );
}
