import { LinearGradient } from "@/lib/linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { api } from "@/lib/api-client";

type Plan = {
  label: string; // "Plan A" | "Plan B" | "Plan C"
  country: string;
  visa: string;
  fit: number; // 0-100
  summary: string;
  timeline?: string;
  cost_estimate?: string;
  steps?: string[];
};

type AnalysisDetail = {
  id: string;
  title: string;
  createdAt: string;
  summary: string;
  plans: Plan[];
};

const PLAN_GRADIENTS: Array<[string, string]> = [
  ["#0a84ff", "#5e5ce6"],
  ["#5e5ce6", "#bf5af2"],
  ["#30d158", "#0a84ff"],
];

const PLAN_SHADOWS = ["#0a84ff", "#bf5af2", "#30d158"];

export default function AnalysisDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery<AnalysisDetail>({
    queryKey: ["analysis", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<AnalysisDetail>(`/ai/analyses/${id}`);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f7" }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {/* Top bar */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 18l-6-6 6-6" />
            </Svg>
            <Text style={{ color: "#0a84ff", fontSize: 16, fontWeight: "600" }}>Back</Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        >
          {query.isLoading ? (
            <SkeletonState />
          ) : query.isError || !query.data ? (
            <ErrorState message={query.error instanceof Error ? query.error.message : "Try again in a moment."} />
          ) : (
            <ResultBody data={query.data} />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ResultBody({ data }: { data: AnalysisDetail }) {
  const ranked = [...data.plans].sort((a, b) => b.fit - a.fit);
  return (
    <View>
      {/* Hero — title + summary */}
      <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
        <Animated.View entering={FadeInUp.duration(700).springify().damping(18)}>
          <Text style={{ color: "#7ab8ff", fontSize: 12, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            Your analysis
          </Text>
          <Text style={{ color: "#000", fontSize: 36, fontWeight: "700", letterSpacing: -1.4, lineHeight: 40 }}>
            {data.title}
          </Text>
          <Text style={{ color: "#86868b", fontSize: 13, marginTop: 6 }}>
            {new Date(data.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </Text>
        </Animated.View>

        <Animated.Text
          entering={FadeIn.duration(600).delay(220)}
          style={{ marginTop: 20, color: "#3a3a3c", fontSize: 16, lineHeight: 24 }}
        >
          {data.summary}
        </Animated.Text>
      </View>

      {/* Plans */}
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
        {ranked.map((plan, i) => (
          <PlanCard key={`${plan.label}-${i}`} plan={plan} index={i} />
        ))}
      </View>

      {/* CTA */}
      <View style={{ paddingHorizontal: 24, marginTop: 28 }}>
        <Animated.View entering={FadeInUp.duration(700).delay(420).springify().damping(20)}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
              router.push("/(tabs)/best-countries" as never);
            }}
            style={({ pressed }) => ({
              paddingVertical: 16,
              borderRadius: 999,
              backgroundColor: pressed ? "#e5e7eb" : "#f2f2f7",
              alignItems: "center",
            })}
          >
            <Text style={{ color: "#000", fontSize: 16, fontWeight: "600", letterSpacing: -0.2 }}>
              Compare with another country
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

function PlanCard({ plan, index }: { plan: Plan; index: number }) {
  const accent = PLAN_GRADIENTS[index % PLAN_GRADIENTS.length];
  const shadow = PLAN_SHADOWS[index % PLAN_SHADOWS.length];
  const rank = String.fromCharCode(65 + index); // A, B, C
  const fitLabel = plan.fit >= 75 ? "Strong fit" : plan.fit >= 55 ? "Good fit" : "Worth exploring";

  // Subtle breathing gradient on the rank badge
  const pulse = useSharedValue(0.92);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.92, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, []);
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.duration(700).delay(120 + index * 100).springify().damping(20)}
      style={{
        backgroundColor: "#fff",
        borderRadius: 28,
        padding: 22,
        shadowColor: shadow,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 6,
      }}
    >
      {/* Header — rank + fit */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Animated.View style={badgeStyle}>
            <LinearGradient
              colors={accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 38, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>{rank}</Text>
            </LinearGradient>
          </Animated.View>
          <Text style={{ color: "#86868b", fontSize: 12, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" }}>
            Plan {rank}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: shadow, fontSize: 30, fontWeight: "700", letterSpacing: -1.2, lineHeight: 32 }}>
            {plan.fit}%
          </Text>
          <Text style={{ color: "#86868b", fontSize: 11, marginTop: 1 }}>{fitLabel}</Text>
        </View>
      </View>

      {/* Title */}
      <Text style={{ color: "#000", fontSize: 22, fontWeight: "700", letterSpacing: -0.5, lineHeight: 28 }}>
        {plan.visa}
      </Text>
      <Text style={{ color: "#86868b", fontSize: 14, marginTop: 4 }}>
        {plan.country}
      </Text>

      <Text style={{ color: "#3a3a3c", fontSize: 14, lineHeight: 22, marginTop: 14 }}>
        {plan.summary}
      </Text>

      {/* Metrics */}
      {(plan.timeline || plan.cost_estimate) ? (
        <View
          style={{
            flexDirection: "row",
            marginTop: 20,
            paddingTop: 18,
            borderTopWidth: 1,
            borderTopColor: "#f3f4f6",
            gap: 28,
          }}
        >
          {plan.timeline ? (
            <Metric label="Timeline" value={plan.timeline} />
          ) : null}
          {plan.cost_estimate ? (
            <Metric label="Est. cost" value={plan.cost_estimate} />
          ) : null}
        </View>
      ) : null}

      {/* Steps */}
      {plan.steps?.length ? (
        <View style={{ marginTop: 20, gap: 10 }}>
          <Text style={{ color: "#86868b", fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" }}>
            Next steps
          </Text>
          {plan.steps.slice(0, 5).map((s, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: shadow + "1a",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}
              >
                <Text style={{ color: shadow, fontSize: 11, fontWeight: "700" }}>
                  {i + 1}
                </Text>
              </View>
              <Text style={{ color: "#1f2937", fontSize: 14, lineHeight: 20, flex: 1 }}>
                {s}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ color: "#86868b", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text style={{ color: "#000", fontSize: 15, fontWeight: "700", marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
}

function SkeletonState() {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
      <Animated.View style={[pulseStyle, { width: 200, height: 14, borderRadius: 7, backgroundColor: "#e5e7eb" }]} />
      <Animated.View style={[pulseStyle, { width: 280, height: 30, borderRadius: 8, backgroundColor: "#e5e7eb", marginTop: 12 }]} />
      <Animated.View style={[pulseStyle, { width: "100%", height: 14, borderRadius: 7, backgroundColor: "#e5e7eb", marginTop: 24 }]} />
      <Animated.View style={[pulseStyle, { width: "85%", height: 14, borderRadius: 7, backgroundColor: "#e5e7eb", marginTop: 8 }]} />
      <View style={{ marginTop: 28, gap: 16 }}>
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={[pulseStyle, { height: 220, borderRadius: 28, backgroundColor: "#e5e7eb" }]}
          />
        ))}
      </View>
    </View>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 32, alignItems: "center" }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          backgroundColor: "#fff7ed",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 28 }}>⚠️</Text>
      </View>
      <Text style={{ marginTop: 18, fontSize: 22, fontWeight: "700", color: "#000", letterSpacing: -0.6 }}>
        Analysis unavailable
      </Text>
      <Text style={{ marginTop: 10, color: "#86868b", fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 280 }}>
        {message}
      </Text>
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => ({
          marginTop: 24,
          paddingHorizontal: 28,
          paddingVertical: 14,
          borderRadius: 999,
          backgroundColor: pressed ? "#e5e7eb" : "#f2f2f7",
        })}
      >
        <Text style={{ color: "#000", fontSize: 15, fontWeight: "600" }}>Go back</Text>
      </Pressable>
    </View>
  );
}
