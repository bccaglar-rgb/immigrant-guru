import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/lib/api-client";

type AnalysisItem = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
};

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  const floatY = useSharedValue(0);
  const scale = useSharedValue(0.85);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 120 });
    floatY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View entering={FadeIn.duration(600)} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingTop: 60 }}>
      {/* Animated icon */}
      <Animated.View style={[iconStyle, { marginBottom: 32 }]}>
        <View style={{ width: 120, height: 120, borderRadius: 36, backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center", shadowColor: "#0071e3", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 8 }}>
          <Svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <Rect x="2" y="10" width="4" height="12" />
            <Rect x="9" y="4"  width="4" height="18" />
            <Rect x="16" y="7" width="4" height="15" />
          </Svg>
        </View>
      </Animated.View>

      {/* Text */}
      <Animated.View entering={FadeInDown.delay(200).springify()} style={{ alignItems: "center", gap: 10 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: "#111827", textAlign: "center", letterSpacing: -0.5 }}>
          No analyses yet
        </Text>
        <Text style={{ fontSize: 15, color: "#6b7280", textAlign: "center", lineHeight: 23 }}>
          Run your first AI analysis to discover the best countries and visa paths tailored to your profile.
        </Text>
      </Animated.View>

      {/* Steps */}
      <Animated.View entering={FadeInDown.delay(350).springify()} style={{ marginTop: 28, gap: 12, width: "100%" }}>
        {[
          { n: "1", text: "Your profile is reviewed by AI" },
          { n: "2", text: "Countries ranked by fit score" },
          { n: "3", text: "Visa paths & timeline generated" },
        ].map((s) => (
          <View key={s.n} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#0071e3" }}>{s.n}</Text>
            </View>
            <Text style={{ fontSize: 14, color: "#374151", flex: 1 }}>{s.text}</Text>
          </View>
        ))}
      </Animated.View>

      {/* CTA */}
      <Animated.View entering={FadeInDown.delay(480).springify()} style={{ marginTop: 32, width: "100%" }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
            router.push("/analysis/new" as never);
          }}
        >
          <LinearGradient
            colors={["#0060d0", "#0071e3", "#5e5ce6"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 18, paddingVertical: 16, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>✦  Run my first analysis</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ── Analysis card ─────────────────────────────────────────────────────────────
function AnalysisCard({ item, index }: { item: AnalysisItem; index: number }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify().damping(18)}
      style={animStyle}
    >
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 15, stiffness: 400 }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 400 }); }}
        onPress={() => router.push(`/analysis/${item.id}` as never)}
      >
        <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#0071e3" }} />
            <Text style={{ fontSize: 11, color: "#9ca3af", fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" }}>
              {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 6 }} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: 19 }} numberOfLines={3}>
            {item.summary}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12 }}>
            <Text style={{ fontSize: 13, color: "#0071e3", fontWeight: "600" }}>View full report</Text>
            <Text style={{ fontSize: 13, color: "#0071e3" }}>→</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function AnalysisScreen() {
  const queryClient = useQueryClient();

  const query = useQuery<AnalysisItem[]>({
    queryKey: ["analyses"],
    queryFn: async () => {
      const res = await api.get<AnalysisItem[]>("/ai/analyses");
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
  });

  const hasData = query.data && query.data.length > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f5f7" }} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={hasData || query.isLoading ? { padding: 20, paddingBottom: 40, gap: 14 } : { flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["analyses"] })}
            tintColor="#0071e3"
          />
        }
      >
        {/* Header — only when has data */}
        {hasData && (
          <Animated.View entering={FadeIn} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <View>
              <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827" }}>My Analysis</Text>
              <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Your AI-generated strategies</Text>
            </View>
            <Pressable
              onPress={() => router.push("/analysis/new" as never)}
              style={{ backgroundColor: "#0071e3", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}
            >
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>+ New</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Loading */}
        {query.isLoading && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
            <Animated.View entering={FadeIn}>
              <Text style={{ fontSize: 15, color: "#9ca3af" }}>Loading…</Text>
            </Animated.View>
          </View>
        )}

        {/* Error */}
        {query.isError && !query.isLoading && (
          <EmptyState />
        )}

        {/* Empty */}
        {!query.isLoading && !query.isError && !hasData && <EmptyState />}

        {/* List */}
        {hasData && query.data!.map((a, i) => (
          <AnalysisCard key={a.id} item={a} index={i} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
