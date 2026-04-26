import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
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
import Svg, { Circle, Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";

const BENEFITS = [
  {
    icon: (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx="12" cy="12" r="10" />
        <Path d="M12 8v4l3 3" />
      </Svg>
    ),
    title: "Save months of research",
    body: "AI ranks countries and visa paths matched to your exact profile in seconds.",
  },
  {
    icon: (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M9 11l3 3L22 4" />
        <Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </Svg>
    ),
    title: "Step-by-step action plan",
    body: "Documents, timelines and costs — tailored to your situation, not generic advice.",
  },
  {
    icon: (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </Svg>
    ),
    title: "Always up to date",
    body: "Our knowledge base is continuously updated with the latest immigration rules.",
  },
];

export default function LandingScreen() {
  const floatY = useSharedValue(0);
  const logoScale = useSharedValue(0.8);

  useEffect(() => {
    logoScale.value = withSpring(1, { damping: 14, stiffness: 100 });
    floatY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }, { scale: logoScale.value }],
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f5f7" }}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 16, paddingBottom: 32, justifyContent: "space-between" }}>

        {/* Top section: logo + headline */}
        <View style={{ alignItems: "center", paddingTop: 24 }}>
          {/* Floating logo icon */}
          <Animated.View style={[logoStyle, { marginBottom: 28 }]}>
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 28,
                backgroundColor: "#0071e3",
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#0071e3",
                shadowOffset: { width: 0, height: 16 },
                shadowOpacity: 0.35,
                shadowRadius: 28,
                elevation: 10,
              }}
            >
              <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 2L3 7v10l9 5 9-5V7l-9-5z"
                  fill="rgba(255,255,255,0.18)"
                  stroke="white"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
                <Path
                  d="M12 2v20M3 7l9 5 9-5"
                  stroke="white"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).springify()} style={{ alignItems: "center", gap: 10 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 2.5,
                color: "#0071e3",
                textTransform: "uppercase",
              }}
            >
              Immigrant Guru
            </Text>
            <Text
              style={{
                fontSize: 34,
                fontWeight: "800",
                color: "#111827",
                textAlign: "center",
                lineHeight: 41,
                letterSpacing: -0.8,
              }}
            >
              Move to a new{"\n"}country with{"\n"}confidence.
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: "#6b7280",
                textAlign: "center",
                lineHeight: 24,
                marginTop: 4,
              }}
            >
              AI-powered immigration guidance{"\n"}personalised to your profile.
            </Text>
          </Animated.View>
        </View>

        {/* Benefits */}
        <Animated.View entering={FadeInDown.delay(280).springify()} style={{ gap: 14, marginVertical: 8 }}>
          {BENEFITS.map((b, i) => (
            <Animated.View
              key={b.title}
              entering={FadeInDown.delay(300 + i * 80).springify()}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 14,
                backgroundColor: "#fff",
                borderRadius: 16,
                padding: 16,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  backgroundColor: "#eff6ff",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {b.icon}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#111827" }}>{b.title}</Text>
                <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: 18 }}>{b.body}</Text>
              </View>
            </Animated.View>
          ))}
        </Animated.View>

        {/* CTAs */}
        <Animated.View entering={FadeIn.delay(500).duration(400)} style={{ gap: 12 }}>
          {/* Primary CTA */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
              router.push("/(auth)/sign-up");
            }}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#0060c8" : "#0071e3",
              borderRadius: 16,
              paddingVertical: 17,
              alignItems: "center",
            })}
          >
            <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", letterSpacing: -0.2 }}>
              Get started — it's free
            </Text>
          </Pressable>

          {/* Sign-in link */}
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              router.push("/(auth)/sign-in");
            }}
            style={({ pressed }) => ({
              borderRadius: 16,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: pressed ? "#e5e7eb" : "transparent",
            })}
          >
            <Text style={{ color: "#374151", fontSize: 15, fontWeight: "600" }}>
              Already have an account?{" "}
              <Text style={{ color: "#0071e3" }}>Sign in</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
