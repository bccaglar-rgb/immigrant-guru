import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { colors } from "@/theme/colors";

/** Public landing page — mirrors apps/web home hero, how-it-works, results,
 *  social proof, and final CTA in a single scroll. */
export default function LandingScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Hero />
        <HowItWorks />
        <ResultsPreview />
        <SocialProof />
        <FinalCta />
        <Footer />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <View className="px-6 pt-8 pb-10 gap-5">
      <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
        Built for immigrants, by immigrants
      </Text>
      <Text className="text-4xl font-semibold text-ink leading-tight">
        Move to a new country{" "}
        <Text style={{ color: colors.accent }}>without confusion.</Text>
      </Text>
      <Text className="text-base text-muted leading-relaxed">
        Get your personalized visa, readiness score, and action plan in minutes. Not months.
      </Text>

      <View className="gap-3 mt-2">
        <Button fullWidth size="lg" onPress={() => router.push("/(auth)/sign-up")}>
          Start your plan
        </Button>
      </View>
    </View>
  );
}

// ── How it works ───────────────────────────────────────────────────────────────

const STEPS: Array<{ n: string; title: string; body: string }> = [
  {
    n: "1",
    title: "Build your profile",
    body:
      "Five quick steps — nationality, goals, education, experience. We ask what matters for visas."
  },
  {
    n: "2",
    title: "Get your AI analysis",
    body:
      "We run 47 visa pathways against your profile and return Plan A, B, and C with fit scores."
  },
  {
    n: "3",
    title: "Follow your action plan",
    body:
      "Step-by-step roadmap, document checklist, cost and timeline estimates. Update as you go."
  }
];

function HowItWorks() {
  return (
    <View className="px-6 py-8 gap-4 bg-card border-y border-gray-200">
      <View className="gap-1">
        <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
          How it works
        </Text>
        <Text className="text-2xl font-semibold text-ink">From zero to a clear plan</Text>
      </View>
      {STEPS.map((s) => (
        <View key={s.n} className="flex-row gap-4">
          <View className="w-10 h-10 rounded-full bg-accent/10 items-center justify-center">
            <Text className="text-accent font-semibold text-lg">{s.n}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-ink">{s.title}</Text>
            <Text className="text-sm text-muted leading-relaxed mt-0.5">{s.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Results preview ────────────────────────────────────────────────────────────

function ResultsPreview() {
  return (
    <View className="px-6 py-10 gap-4">
      <View className="gap-1">
        <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
          Your best path
        </Text>
        <Text className="text-2xl font-semibold text-ink">
          What your analysis looks like
        </Text>
      </View>

      <Card>
        <LinearGradient
          colors={["#0071e3", "#5e5ce6", "#bf5af2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            height: 4,
            borderRadius: 999,
            marginBottom: 16,
            marginHorizontal: -8,
            opacity: 0.9
          }}
        />
        <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
          Plan A · 92% fit
        </Text>
        <Text className="text-xl font-semibold text-ink mt-1">
          National Interest Waiver · United States
        </Text>
        <Text className="text-sm text-muted mt-2 leading-relaxed">
          No employer sponsor needed — you can self-petition.
        </Text>
        <View className="flex-row gap-6 mt-4">
          <Metric label="Timeline" value="12-18 months" />
          <Metric label="Est. cost" value="$5-9k" />
          <Metric label="Readiness" value="Strong" />
        </View>
      </Card>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Card>
            <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
              Plan B · 78%
            </Text>
            <Text className="text-base font-semibold text-ink mt-1">
              Canada Express Entry
            </Text>
          </Card>
        </View>
        <View className="flex-1">
          <Card>
            <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
              Plan C · 71%
            </Text>
            <Text className="text-base font-semibold text-ink mt-1">
              Portugal D7
            </Text>
          </Card>
        </View>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs uppercase tracking-widest text-muted">{label}</Text>
      <Text className="text-sm font-semibold text-ink mt-0.5">{value}</Text>
    </View>
  );
}

// ── Social proof ───────────────────────────────────────────────────────────────

function SocialProof() {
  return (
    <View className="px-6 py-8 bg-card border-y border-gray-200">
      <Text className="text-xs font-semibold uppercase tracking-widest text-accent text-center">
        Thousands trust Immigrant Guru
      </Text>
      <View className="flex-row justify-around mt-5">
        <Stat number="47" label="Visa pathways" />
        <Stat number="190+" label="Countries covered" />
        <Stat number="10k+" label="Plans generated" />
      </View>
    </View>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <View className="items-center">
      <Text className="text-2xl font-semibold text-ink">{number}</Text>
      <Text className="text-xs text-muted mt-0.5 text-center">{label}</Text>
    </View>
  );
}

// ── Final CTA ──────────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <View className="px-6 py-10 gap-4">
      <Text className="text-3xl font-semibold text-ink">
        Ready to move with clarity?
      </Text>
      <Text className="text-base text-muted leading-relaxed">
        Build your profile, get your first analysis, and see your best three paths — in under 10
        minutes.
      </Text>
      <Button fullWidth size="lg" onPress={() => router.push("/(auth)/sign-up")}>
        Create your account
      </Button>
      <Button variant="ghost" onPress={() => router.push("/(auth)/sign-in")}>
        Sign in instead
      </Button>
    </View>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <View className="px-6 pt-4 pb-2 items-center">
      <Text className="text-xs text-muted">© Immigrant Guru</Text>
    </View>
  );
}
