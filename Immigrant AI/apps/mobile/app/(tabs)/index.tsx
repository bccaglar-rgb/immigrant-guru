import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";

type DashboardPayload = {
  score?: { value: number; label: string } | null;
  recentAnalysis?: { id: string; title: string; createdAt: string } | null;
  recommendations?: Array<{ country: string; visa: string; fit: number }>;
};

export default function DashboardScreen() {
  const user = useAuth((s) => s.user);
  const query = useQuery<DashboardPayload>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await api.get<DashboardPayload>("/dashboard");
      if (!res.ok) throw new Error(res.message);
      return res.data;
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
        <View className="gap-1">
          <Text className="text-sm text-muted">Welcome back</Text>
          <Text className="text-3xl font-semibold text-ink">{user?.email ?? "there"}</Text>
        </View>

        <Card>
          <Text className="text-sm font-medium text-muted">Your plan</Text>
          <View className="flex-row items-baseline justify-between mt-1">
            <Text className="text-2xl font-semibold text-ink capitalize">
              {user?.plan ?? "free"}
            </Text>
            {user?.plan === "free" ? (
              <Button size="sm" onPress={() => router.push("/paywall")}>
                Upgrade
              </Button>
            ) : null}
          </View>
        </Card>

        <Card>
          <Text className="text-sm font-medium text-muted">Readiness score</Text>
          <Text className="text-4xl font-semibold text-ink mt-1">
            {query.data?.score?.value ?? "—"}
          </Text>
          <Text className="text-sm text-muted mt-1">
            {query.data?.score?.label ?? "Complete your profile to unlock your score."}
          </Text>
          <View className="mt-3">
            <Button variant="secondary" onPress={() => router.push("/onboarding")}>
              Continue profile
            </Button>
          </View>
        </Card>

        <Card>
          <Text className="text-sm font-medium text-muted">Top recommendations</Text>
          {query.data?.recommendations?.length ? (
            <View className="gap-3 mt-3">
              {query.data.recommendations.slice(0, 3).map((r) => (
                <View
                  key={`${r.country}-${r.visa}`}
                  className="flex-row items-center justify-between"
                >
                  <View>
                    <Text className="text-base font-semibold text-ink">{r.country}</Text>
                    <Text className="text-xs text-muted">{r.visa}</Text>
                  </View>
                  <Text className="text-sm font-semibold text-accent">{r.fit}%</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-sm text-muted mt-1">
              Run an analysis to see countries that fit your profile.
            </Text>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
