import { LinearGradient } from "@/lib/linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/** Apple-grade landing — full-bleed hero, whitespace-heavy sections,
 *  scroll-triggered fades. Copy is declarative and short. */
export default function LandingScreen() {
  const scrollY = useSharedValue(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = e.nativeEvent.contentOffset.y;
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 0 }}
        bounces
      >
        <Hero scrollY={scrollY} />
        <Section dark={false}>
          <PromiseStrip />
        </Section>
        <Section dark>
          <Steps />
        </Section>
        <Section dark={false}>
          <PlanShowcase />
        </Section>
        <Section dark>
          <Stats />
        </Section>
        <FinalCta />
        <Footer />
      </ScrollView>
    </View>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ scrollY }: { scrollY: Animated.SharedValue<number> }) {
  const insets = useSafeInsets();

  // Headline cascade + parallax on scroll
  const parallaxStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [0, SCREEN_H], [0, -120]) }],
    opacity: interpolate(scrollY.value, [0, SCREEN_H * 0.45, SCREEN_H * 0.7], [1, 1, 0]),
  }));

  return (
    <View style={{ height: SCREEN_H * 0.95, overflow: "hidden", backgroundColor: "#000" }}>
      {/* Cosmic gradient backdrop */}
      <LinearGradient
        colors={["#000000", "#050a1c", "#0a1633", "#0f1f4d"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ ...absoluteFill }}
      />
      <PulseOrb />
      <FloatingDots />

      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <Animated.View
          style={[
            parallaxStyle,
            { flex: 1, paddingHorizontal: 28, justifyContent: "center" },
          ]}
        >
          <Animated.Text
            entering={FadeInDown.duration(700).delay(120).springify().damping(18)}
            style={{
              color: "#7ab8ff",
              fontSize: 13,
              fontWeight: "600",
              letterSpacing: 4,
              textTransform: "uppercase",
              marginBottom: 18,
            }}
          >
            Immigrant Guru
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.duration(800).delay(220).springify().damping(18)}
            style={{
              color: "#fff",
              fontSize: 64,
              fontWeight: "700",
              letterSpacing: -2.5,
              lineHeight: 66,
            }}
          >
            Move{"\n"}smarter.
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.duration(800).delay(360).springify().damping(18)}
            style={{
              color: "rgba(255,255,255,0.62)",
              fontSize: 19,
              lineHeight: 28,
              marginTop: 22,
              maxWidth: 320,
            }}
          >
            AI maps every visa to your story.{"\n"}
            Three plans. One path. Yours.
          </Animated.Text>

          <Animated.View
            entering={FadeInUp.duration(700).delay(620).springify().damping(20)}
            style={{ marginTop: 38, flexDirection: "row", gap: 12 }}
          >
            <PrimaryCTA label="Get started" onPress={() => router.push("/(auth)/sign-up")} />
            <GhostCTA label="Sign in" onPress={() => router.push("/(auth)/sign-in")} />
          </Animated.View>
        </Animated.View>

        {/* Scroll cue at the bottom */}
        <Animated.View
          entering={FadeIn.duration(900).delay(1100)}
          style={{ position: "absolute", bottom: insets.bottom + 24, left: 0, right: 0, alignItems: "center" }}
        >
          <ScrollCue />
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

function PrimaryCTA({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={() => {
          scale.value = withTiming(0.96, { duration: 120 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 160 }); }}
        onPress={onPress}
        style={{
          backgroundColor: "#0a84ff",
          paddingHorizontal: 28,
          paddingVertical: 16,
          borderRadius: 999,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 17, fontWeight: "600", letterSpacing: -0.2 }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function GhostCTA({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={() => {
          scale.value = withTiming(0.96, { duration: 120 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 160 }); }}
        onPress={onPress}
        style={{
          paddingHorizontal: 22,
          paddingVertical: 16,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.28)",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 17, fontWeight: "500", letterSpacing: -0.2 }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// Slow-rotating + breathing orb behind the hero text
function PulseOrb() {
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0.5);
  const rotate = useSharedValue(0);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.85, { duration: 3200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.75, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.45, { duration: 3200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    rotate.value = withRepeat(withTiming(360, { duration: 30000, easing: Easing.linear }), -1, false);
  }, []);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
    opacity: opacity.value,
  }));

  const orbSize = SCREEN_W * 1.25;

  return (
    <Animated.View
      style={[
        orbStyle,
        {
          position: "absolute",
          top: SCREEN_H * 0.18,
          left: (SCREEN_W - orbSize) / 2,
          width: orbSize,
          height: orbSize,
        },
      ]}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%" viewBox="0 0 200 200">
        <Defs>
          <RadialGradient id="orb" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#5e9bff" stopOpacity="0.55" />
            <Stop offset="55%" stopColor="#0a84ff" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#0a84ff" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="100" cy="100" r="100" fill="url(#orb)" />
      </Svg>
    </Animated.View>
  );
}

// Decorative starfield-style dots floating slowly
function FloatingDots() {
  return (
    <View style={{ ...absoluteFill }} pointerEvents="none">
      {DOTS.map((d, i) => (
        <FloatingDot key={i} {...d} />
      ))}
    </View>
  );
}

const DOTS = [
  { top: 0.08, left: 0.12, size: 4, delay: 0, drift: 12 },
  { top: 0.18, left: 0.78, size: 3, delay: 600, drift: 8 },
  { top: 0.34, left: 0.18, size: 2, delay: 200, drift: 14 },
  { top: 0.52, left: 0.86, size: 3, delay: 900, drift: 10 },
  { top: 0.68, left: 0.08, size: 4, delay: 300, drift: 16 },
  { top: 0.78, left: 0.62, size: 2, delay: 1100, drift: 9 },
  { top: 0.42, left: 0.5, size: 2, delay: 500, drift: 7 },
  { top: 0.88, left: 0.32, size: 3, delay: 800, drift: 11 },
];

function FloatingDot({ top, left, size, delay, drift }: { top: number; left: number; size: number; delay: number; drift: number }) {
  const y = useSharedValue(0);
  const o = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-drift, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
          withTiming(drift, { duration: 4200, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
    o.value = withDelay(delay, withTiming(1, { duration: 1200 }));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: o.value,
  }));
  return (
    <Animated.View
      style={[
        style,
        {
          position: "absolute",
          top: SCREEN_H * top,
          left: SCREEN_W * left,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#fff",
        },
      ]}
    />
  );
}

function ScrollCue() {
  const translate = useSharedValue(0);
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    translate.value = withRepeat(
      withSequence(
        withTiming(6, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.95, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.45, { duration: 1100, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translate.value }],
    opacity: opacity.value,
  }));
  return (
    <Animated.View style={style}>
      <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>
        Scroll
      </Text>
    </Animated.View>
  );
}

// ── Section wrapper with scroll-triggered fade ───────────────────────────────

function Section({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  return (
    <View
      style={{
        backgroundColor: dark ? "#000" : "#f5f5f7",
        paddingVertical: 96,
        paddingHorizontal: 28,
      }}
    >
      <RevealOnScroll>{children}</RevealOnScroll>
    </View>
  );
}

function RevealOnScroll({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const onLayout = (_: LayoutChangeEvent) => {
    if (!visible) setVisible(true);
  };
  return (
    <View onLayout={onLayout}>
      {visible ? (
        <Animated.View entering={FadeInUp.duration(700).springify().damping(18)}>
          {children}
        </Animated.View>
      ) : (
        <View style={{ opacity: 0 }}>{children}</View>
      )}
    </View>
  );
}

// ── Promise strip (the "what is it" answer in 4 words) ───────────────────────

function PromiseStrip() {
  return (
    <View>
      <Eyebrow color="#0071e3">The promise</Eyebrow>
      <Text style={{ fontSize: 44, fontWeight: "700", color: "#000", letterSpacing: -1.6, lineHeight: 50, marginTop: 14 }}>
        Tell us about you.{"\n"}
        <Text style={{ color: "#0071e3" }}>We map your future.</Text>
      </Text>
      <Text style={{ marginTop: 22, fontSize: 18, lineHeight: 28, color: "#3a3a3c", maxWidth: 360 }}>
        Forty-seven visa pathways across one hundred and ninety countries.
        Reduced to the three that fit you. In minutes, not months.
      </Text>
    </View>
  );
}

// ── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { num: "01", title: "Tell us.", body: "A few quick questions about who you are and where you want to go." },
  { num: "02", title: "We map it.", body: "Forty-seven pathways scored against your profile. In seconds." },
  { num: "03", title: "You move.", body: "Roadmap. Documents. Costs. Timelines. All in one place." },
];

function Steps() {
  return (
    <View>
      <Eyebrow color="#7ab8ff">How it works</Eyebrow>
      <Text style={{ fontSize: 44, fontWeight: "700", color: "#fff", letterSpacing: -1.6, lineHeight: 50, marginTop: 14 }}>
        Three steps.{"\n"}One outcome.
      </Text>
      <View style={{ marginTop: 44, gap: 36 }}>
        {STEPS.map((s, i) => (
          <RevealOnScroll key={s.num}>
            <View style={{ paddingTop: i === 0 ? 0 : 20, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "rgba(255,255,255,0.12)" }}>
              <Text style={{ color: "#7ab8ff", fontSize: 13, fontWeight: "600", letterSpacing: 2 }}>
                {s.num}
              </Text>
              <Text style={{ color: "#fff", fontSize: 30, fontWeight: "700", letterSpacing: -1, marginTop: 6 }}>
                {s.title}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.62)", fontSize: 17, lineHeight: 26, marginTop: 8 }}>
                {s.body}
              </Text>
            </View>
          </RevealOnScroll>
        ))}
      </View>
    </View>
  );
}

// ── Plan showcase (mock analysis card with subtle motion) ────────────────────

function PlanShowcase() {
  return (
    <View>
      <Eyebrow color="#0071e3">Your analysis</Eyebrow>
      <Text style={{ fontSize: 44, fontWeight: "700", color: "#000", letterSpacing: -1.6, lineHeight: 50, marginTop: 14 }}>
        Plan A.{"\n"}Plan B.{"\n"}Plan C.
      </Text>
      <Text style={{ marginTop: 22, fontSize: 18, lineHeight: 28, color: "#3a3a3c", maxWidth: 360 }}>
        Ranked by fit. With timelines, costs, and the next step you can take today.
      </Text>

      <View style={{ marginTop: 44, gap: 16 }}>
        <PlanCard
          rank="A"
          fit={92}
          title="National Interest Waiver"
          country="United States"
          tag="No employer sponsor needed"
          metrics={[
            { k: "Timeline", v: "12–18 mo" },
            { k: "Est. cost", v: "$5–9k" },
            { k: "Readiness", v: "Strong" },
          ]}
          accent="#0a84ff"
          delay={0}
        />
        <PlanCard
          rank="B"
          fit={78}
          title="Express Entry"
          country="Canada"
          tag="Federal Skilled Worker stream"
          metrics={[
            { k: "Timeline", v: "8–14 mo" },
            { k: "Est. cost", v: "$2–4k" },
            { k: "Readiness", v: "Good" },
          ]}
          accent="#5e5ce6"
          delay={120}
        />
        <PlanCard
          rank="C"
          fit={71}
          title="D7 Passive Income"
          country="Portugal"
          tag="Ideal for remote workers"
          metrics={[
            { k: "Timeline", v: "4–8 mo" },
            { k: "Est. cost", v: "$1–3k" },
            { k: "Readiness", v: "Good" },
          ]}
          accent="#bf5af2"
          delay={240}
        />
      </View>
    </View>
  );
}

function PlanCard({
  rank,
  fit,
  title,
  country,
  tag,
  metrics,
  accent,
  delay,
}: {
  rank: string;
  fit: number;
  title: string;
  country: string;
  tag: string;
  metrics: { k: string; v: string }[];
  accent: string;
  delay: number;
}) {
  const tilt = useSharedValue(0);
  useEffect(() => {
    tilt.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.4, { duration: 3500, easing: Easing.inOut(Easing.sin) }),
          withTiming(-0.4, { duration: 3500, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tilt.value}deg` }],
  }));
  return (
    <Animated.View
      entering={FadeInUp.duration(700).delay(delay).springify().damping(18)}
      style={[
        style,
        {
          backgroundColor: "#fff",
          borderRadius: 28,
          padding: 24,
          shadowColor: accent,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.18,
          shadowRadius: 28,
          elevation: 6,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            backgroundColor: accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{rank}</Text>
        </View>
        <Text style={{ color: accent, fontSize: 13, fontWeight: "700", letterSpacing: 1.4 }}>
          {fit}% FIT
        </Text>
      </View>
      <Text style={{ fontSize: 24, fontWeight: "700", color: "#000", letterSpacing: -0.6 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 14, color: "#86868b", marginTop: 4 }}>
        {country}
      </Text>
      <Text style={{ fontSize: 14, color: "#3a3a3c", marginTop: 12, lineHeight: 20 }}>
        {tag}
      </Text>
      <View style={{ flexDirection: "row", marginTop: 18, gap: 22 }}>
        {metrics.map((m) => (
          <View key={m.k}>
            <Text style={{ fontSize: 11, color: "#86868b", letterSpacing: 1.2, textTransform: "uppercase" }}>
              {m.k}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#000", marginTop: 3 }}>
              {m.v}
            </Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ── Stats ────────────────────────────────────────────────────────────────────

function Stats() {
  return (
    <View>
      <Eyebrow color="#7ab8ff">By the numbers</Eyebrow>
      <Text style={{ fontSize: 44, fontWeight: "700", color: "#fff", letterSpacing: -1.6, lineHeight: 50, marginTop: 14 }}>
        Built for{"\n"}every story.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 44, gap: 12 }}>
        <StatCard big="47" label="Visa pathways" />
        <StatCard big="190+" label="Countries" />
        <StatCard big="10k+" label="Plans built" />
        <StatCard big="∞" label="Lives changed" />
      </View>
    </View>
  );
}

function StatCard({ big, label }: { big: string; label: string }) {
  return (
    <View
      style={{
        flexBasis: "47%",
        flexGrow: 1,
        padding: 20,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Text style={{ color: "#fff", fontSize: 44, fontWeight: "700", letterSpacing: -1.6 }}>
        {big}
      </Text>
      <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

// ── Final CTA ────────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <View
      style={{
        paddingHorizontal: 28,
        paddingTop: 96,
        paddingBottom: 64,
        backgroundColor: "#000",
        alignItems: "center",
      }}
    >
      <RevealOnScroll>
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              color: "#fff",
              fontSize: 56,
              fontWeight: "700",
              letterSpacing: -2,
              lineHeight: 60,
              textAlign: "center",
            }}
          >
            Your move.
          </Text>
          <Text
            style={{
              color: "rgba(255,255,255,0.62)",
              fontSize: 18,
              lineHeight: 28,
              marginTop: 18,
              textAlign: "center",
              maxWidth: 320,
            }}
          >
            Ten minutes to your first plan.{"\n"}No spreadsheets. No guesswork.
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 36 }}>
            <PrimaryCTA label="Get started" onPress={() => router.push("/(auth)/sign-up")} />
            <GhostCTA label="Sign in" onPress={() => router.push("/(auth)/sign-in")} />
          </View>
        </View>
      </RevealOnScroll>
    </View>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <View
      style={{
        paddingHorizontal: 28,
        paddingTop: 18,
        paddingBottom: 36,
        backgroundColor: "#000",
        alignItems: "center",
      }}
    >
      <Text style={{ color: "rgba(255,255,255,0.32)", fontSize: 12, letterSpacing: 0.5 }}>
        © Immigrant Guru
      </Text>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Eyebrow({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <Text
      style={{
        color,
        fontSize: 13,
        fontWeight: "600",
        letterSpacing: 4,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

const absoluteFill = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

function useSafeInsets() {
  // Tiny shim so the hero can offset for the status bar without pulling
  // the whole SafeAreaInsets context into every helper component.
  return { top: 0, bottom: 0 };
}
