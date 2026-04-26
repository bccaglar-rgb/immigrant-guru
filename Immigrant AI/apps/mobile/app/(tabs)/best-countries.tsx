import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import Svg, { Circle, Line, Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { api } from "@/lib/api-client";

type CountryRec = {
  country: string;
  country_code: string;
  fit: number;
  top_visa: string;
  summary: string;
  cost_of_living?: string;
  visa_difficulty?: string;
};

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸", CA: "🇨🇦", GB: "🇬🇧", AU: "🇦🇺", DE: "🇩🇪", FR: "🇫🇷",
  NL: "🇳🇱", CH: "🇨🇭", SE: "🇸🇪", NO: "🇳🇴", DK: "🇩🇰", AT: "🇦🇹",
  BE: "🇧🇪", IE: "🇮🇪", FI: "🇫🇮", PT: "🇵🇹", ES: "🇪🇸", IT: "🇮🇹",
  NZ: "🇳🇿", SG: "🇸🇬", JP: "🇯🇵", KR: "🇰🇷", AE: "🇦🇪", PL: "🇵🇱",
  CZ: "🇨🇿", EE: "🇪🇪", MT: "🇲🇹", LU: "🇱🇺", TR: "🇹🇷",
};

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  const floatY = useSharedValue(0);
  const scale = useSharedValue(0.85);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 120 });
    floatY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: 2000, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View entering={FadeIn.duration(600)} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingTop: 60 }}>
      <Animated.View style={[iconStyle, { marginBottom: 32 }]}>
        <View style={{ width: 120, height: 120, borderRadius: 36, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center", shadowColor: "#30d158", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 8 }}>
          <Svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx="12" cy="12" r="10" />
            <Line x1="2" y1="12" x2="22" y2="12" />
            <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </Svg>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).springify()} style={{ alignItems: "center", gap: 10 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: "#111827", textAlign: "center", letterSpacing: -0.5 }}>
          No recommendations yet
        </Text>
        <Text style={{ fontSize: 15, color: "#6b7280", textAlign: "center", lineHeight: 23 }}>
          Complete your profile and run an AI analysis — we'll rank the best countries based on your goals and background.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(350).springify()} style={{ marginTop: 28, gap: 12, width: "100%" }}>
        {[
          { emoji: "👤", text: "Fill in your profile details" },
          { emoji: "🤖", text: "AI scores 50+ countries for you" },
          { emoji: "🏆", text: "See your personalised top picks" },
        ].map((s) => (
          <View key={s.emoji} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 14 }}>
            <Text style={{ fontSize: 22 }}>{s.emoji}</Text>
            <Text style={{ fontSize: 14, color: "#374151", flex: 1 }}>{s.text}</Text>
          </View>
        ))}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(480).springify()} style={{ marginTop: 24, width: "100%", gap: 10 }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
            router.push("/analysis/new" as never);
          }}
        >
          <LinearGradient
            colors={["#28c76f", "#20a85a"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 18, paddingVertical: 16, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>✦  Run AI analysis</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          onPress={() => router.push("/onboarding")}
          style={{ borderRadius: 18, paddingVertical: 14, alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb" }}
        >
          <Text style={{ color: "#374151", fontSize: 15, fontWeight: "600" }}>Complete my profile</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ── Country card ──────────────────────────────────────────────────────────────
function CountryCard({ item, index }: { item: CountryRec; index: number }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const flag = FLAG_MAP[item.country_code] ?? "🌍";
  const fitColor = item.fit >= 75 ? "#059669" : item.fit >= 50 ? "#0071e3" : "#f59e0b";
  const fitBg   = item.fit >= 75 ? "#ecfdf5" : item.fit >= 50 ? "#eff6ff" : "#fff7ed";

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 70).springify().damping(18)}
      style={animStyle}
    >
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 15, stiffness: 400 }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 400 }); }}
        onPress={() => router.push(`/move-to/${item.country_code}` as never)}
      >
        <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <Text style={{ fontSize: 34 }}>{flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#111827" }}>{item.country}</Text>
                <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{item.top_visa}</Text>
              </View>
            </View>
            <View style={{ backgroundColor: fitBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: fitColor }}>{item.fit}%</Text>
              <Text style={{ fontSize: 10, color: fitColor, fontWeight: "600" }}>fit</Text>
            </View>
          </View>

          <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: 19, marginTop: 12 }} numberOfLines={2}>
            {item.summary}
          </Text>

          {(item.cost_of_living || item.visa_difficulty) && (
            <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
              {item.cost_of_living && (
                <View style={{ backgroundColor: "#f9fafb", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 10, color: "#9ca3af", fontWeight: "600", textTransform: "uppercase" }}>Cost</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151", marginTop: 1 }}>{item.cost_of_living}</Text>
                </View>
              )}
              {item.visa_difficulty && (
                <View style={{ backgroundColor: "#f9fafb", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 10, color: "#9ca3af", fontWeight: "600", textTransform: "uppercase" }}>Visa</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151", marginTop: 1 }}>{item.visa_difficulty}</Text>
                </View>
              )}
            </View>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12 }}>
            <Text style={{ fontSize: 13, color: "#0071e3", fontWeight: "600" }}>Explore →</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function BestCountriesScreen() {
  const queryClient = useQueryClient();

  const query = useQuery<CountryRec[]>({
    queryKey: ["best-countries"],
    queryFn: async () => {
      const res = await api.get<CountryRec[]>("/ai/best-countries");
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
  });

  const hasData = query.data && query.data.length > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f5f7" }} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={hasData ? { padding: 20, paddingBottom: 40, gap: 14 } : { flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["best-countries"] })}
            tintColor="#0071e3"
          />
        }
      >
        {hasData && (
          <Animated.View entering={FadeIn} style={{ marginBottom: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827" }}>Best Countries</Text>
            <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Ranked by fit with your profile</Text>
          </Animated.View>
        )}

        {(query.isLoading || query.isError || !hasData) && <EmptyState />}

        {hasData && query.data!.map((c, i) => (
          <CountryCard key={c.country_code} item={c} index={i} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
