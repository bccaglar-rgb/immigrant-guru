import { LinearGradient } from "@/lib/linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
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
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, Path, RadialGradient, Stop, Circle } from "react-native-svg";
import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";

import { useAuth } from "@/lib/auth";
import { getOfferings, purchasePackage, restorePurchases } from "@/lib/revenue-cat";

// Hard-coded for the marketing card so the screen still looks finished
// when RevenueCat hasn't yet returned a price (e.g. dev / staging without
// products set up). Real charge always uses pkg.product.priceString below.
const HEADLINE_PRICE = "$29";

const BENEFITS = [
  "Personalized AI analysis of 47 visa pathways",
  "Plan A, B, and C ranked by fit score",
  "Step-by-step roadmap with timelines and costs",
  "Document checklist tailored to your case",
  "Lifetime access — no subscription, no renewals",
];

export default function PaywallScreen() {
  const { required, redirectTo } = useLocalSearchParams<{ required?: string; redirectTo?: string }>();
  const isRequired = required === "true";
  const successDest = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/(tabs)";

  const refreshUser = useAuth((s) => s.refreshUser);
  const signOut = useAuth((s) => s.signOut);
  const setPlanLocal = useAuth((s) => s.setPlanLocal);

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOfferings().then((o) => {
      setOffering(o);
      setLoading(false);
    });
  }, []);

  // Pick the package we surface as the headline plan. Prefers a package
  // identified as lifetime / one-time; otherwise falls back to the first
  // available package so the button is still wired in dev.
  const offer: PurchasesPackage | null = (() => {
    if (!offering) return null;
    const pkgs = offering.availablePackages;
    return (
      pkgs.find((p) => /lifetime|one[_-]?time|onetime|forever|unlock/i.test(p.identifier)) ??
      pkgs[0] ??
      null
    );
  })();

  const buy = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setPurchasing(true);
    setError(null);

    // DEV BYPASS: when there's no RevenueCat offering yet (App Store
    // Connect IAPs not configured), unlock the paid screens locally so
    // the rest of the flow can be tested end-to-end. Real release will
    // gate this on a build-time flag.
    if (!offer) {
      setPlanLocal("starter");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      router.replace(successDest as never);
      setPurchasing(false);
      return;
    }

    const res = await purchasePackage(offer);
    setPurchasing(false);
    if (!res.ok) {
      if (!res.cancelled) setError(res.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    await refreshUser();
    router.replace(successDest as never);
  };

  const onRestore = async () => {
    setRestoring(true);
    await restorePurchases();
    await refreshUser();
    setRestoring(false);
    router.replace(successDest as never);
  };

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  const displayPrice = offer?.product.priceString ?? HEADLINE_PRICE;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Backdrop />

      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        {/* Top bar — close + restore */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingTop: 4,
          }}
        >
          {!isRequired ? (
            <Pressable onPress={dismiss} hitSlop={12} style={{ padding: 4 }}>
              <CloseIcon />
            </Pressable>
          ) : (
            <View style={{ width: 30 }} />
          )}
          <Pressable
            onPress={onRestore}
            disabled={restoring || loading}
            hitSlop={12}
            style={{ padding: 4 }}
          >
            <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 14, fontWeight: "600" }}>
              {restoring ? "Restoring…" : "Restore"}
            </Text>
          </Pressable>
        </View>

        {/* Scroll only the marketing content; the CTA is pinned. */}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={{ alignItems: "center", marginTop: 16 }}>
            <SparkleSeal />
            <Animated.Text
              entering={FadeInDown.duration(700).delay(120).springify().damping(18)}
              style={{
                marginTop: 22,
                color: "#fff",
                fontSize: 36,
                fontWeight: "700",
                letterSpacing: -1.4,
                lineHeight: 40,
                textAlign: "center",
              }}
            >
              Unlock your{"\n"}immigration plan.
            </Animated.Text>
            <Animated.Text
              entering={FadeInDown.duration(700).delay(260).springify().damping(18)}
              style={{
                marginTop: 12,
                color: "rgba(255,255,255,0.62)",
                fontSize: 15,
                lineHeight: 22,
                textAlign: "center",
                maxWidth: 320,
              }}
            >
              One payment. Lifetime access.
            </Animated.Text>
          </View>

          {/* Plan card */}
          <Animated.View
            entering={FadeInUp.duration(700).delay(360).springify().damping(20)}
            style={{
              marginTop: 28,
              padding: 22,
              borderRadius: 28,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <Text style={{ color: "#fff", fontSize: 48, fontWeight: "700", letterSpacing: -2, lineHeight: 50 }}>
                {displayPrice}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginBottom: 10 }}>
                one-time
              </Text>
            </View>
            <Text style={{ marginTop: 4, color: "#7ab8ff", fontSize: 12, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" }}>
              Lifetime access
            </Text>

            <View style={{ marginTop: 18, gap: 10 }}>
              {BENEFITS.map((b, i) => (
                <Animated.View
                  key={b}
                  entering={FadeIn.duration(500).delay(440 + i * 60)}
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}
                >
                  <CheckBubble />
                  <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 14, lineHeight: 21, flex: 1 }}>
                    {b}
                  </Text>
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        </ScrollView>

        {/* Pinned bottom action sheet — always visible. */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 14,
            paddingBottom: 8,
            backgroundColor: "rgba(0,0,0,0.6)",
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.06)",
          }}
        >
          {error ? (
            <View
              style={{
                marginBottom: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: "rgba(255,69,58,0.12)",
                borderWidth: 1,
                borderColor: "rgba(255,69,58,0.25)",
              }}
            >
              <Text style={{ color: "#ff453a", fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={buy}
            disabled={purchasing || loading}
            style={({ pressed }) => ({
              paddingVertical: 18,
              borderRadius: 999,
              backgroundColor: purchasing || loading ? "rgba(255,255,255,0.14)" : "#0a84ff",
              alignItems: "center",
              shadowColor: "#0a84ff",
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.45,
              shadowRadius: 24,
              elevation: 8,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : loading ? (
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 17, fontWeight: "700" }}>
                Loading…
              </Text>
            ) : (
              <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", letterSpacing: -0.2 }}>
                Unlock for {displayPrice}
              </Text>
            )}
          </Pressable>

          <Text
            style={{
              marginTop: 10,
              color: "rgba(255,255,255,0.45)",
              fontSize: 11,
              textAlign: "center",
              lineHeight: 16,
            }}
          >
            One-time payment via the App Store. No auto-renewal.
          </Text>
          <View style={{ flexDirection: "row", gap: 16, marginTop: 8, justifyContent: "center" }}>
            <Pressable onPress={() => Linking.openURL("https://immigrant.guru/terms").catch(() => undefined)}>
              <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Terms</Text>
            </Pressable>
            <Text style={{ color: "rgba(255,255,255,0.3)" }}>·</Text>
            <Pressable onPress={() => Linking.openURL("https://immigrant.guru/privacy").catch(() => undefined)}>
              <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Privacy</Text>
            </Pressable>
            {isRequired ? (
              <>
                <Text style={{ color: "rgba(255,255,255,0.3)" }}>·</Text>
                <Pressable
                  onPress={async () => {
                    await signOut();
                    router.replace("/(auth)/sign-in");
                  }}
                >
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Sign out</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </View>
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
      <Svg
        width="100%"
        height="100%"
        style={{ position: "absolute", top: -120 }}
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient id="paywall-orb" cx="50%" cy="20%" r="60%">
            <Stop offset="0%" stopColor="#5e9bff" stopOpacity="0.45" />
            <Stop offset="55%" stopColor="#0a84ff" stopOpacity="0.12" />
            <Stop offset="100%" stopColor="#0a84ff" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50%" cy="20%" r="80%" fill="url(#paywall-orb)" />
      </Svg>
    </View>
  );
}

function SparkleSeal() {
  const scale = useSharedValue(0.85);
  const rotate = useSharedValue(0);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.9, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    rotate.value = withRepeat(withTiming(360, { duration: 18000, easing: Easing.linear }), -1, false);
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));
  return (
    <Animated.View
      style={[
        animStyle,
        {
          width: 92,
          height: 92,
          borderRadius: 30,
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
      <Svg width={42} height={42} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
        <Path d="M5 3l.9 2.7L8 6.5l-2.1.8L5 10l-.9-2.7L2 6.5l2.1-.8L5 3z" />
        <Path d="M19 14l.9 2.7 2.1.8-2.1.8L19 21l-.9-2.7-2.1-.8 2.1-.8L19 14z" />
      </Svg>
    </Animated.View>
  );
}

function CheckBubble() {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: "#0a84ff",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
      }}
    >
      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M5 13l4 4L19 7" />
      </Svg>
    </View>
  );
}

function CloseIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round">
      <Path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}
