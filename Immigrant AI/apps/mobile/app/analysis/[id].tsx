import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api-client";

type Plan = {
  label: string;         // "Plan A" | "Plan B" | "Plan C"
  country: string;
  visa: string;
  fit: number;           // 0-100
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

export default function AnalysisDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery<AnalysisDetail>({
    queryKey: ["analysis", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<AnalysisDetail>(`/ai/analyses/${id}`);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={() => router.back()} className="py-2 pr-3">
          <Text className="text-accent text-base font-semibold">← Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 16 }}>
        {query.isLoading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color="#0071e3" />
          </View>
        ) : query.isError || !query.data ? (
          <Card>
            <Text className="text-base font-semibold text-ink">Analysis unavailable</Text>
            <Text className="text-sm text-muted mt-1">
              {query.error instanceof Error ? query.error.message : "Try again in a moment."}
            </Text>
          </Card>
        ) : (
          <>
            <View>
              <Text className="text-3xl font-semibold text-ink">{query.data.title}</Text>
              <Text className="text-sm text-muted mt-1">
                {new Date(query.data.createdAt).toLocaleDateString()}
              </Text>
            </View>

            <Card>
              <Text className="text-sm font-medium text-muted">Summary</Text>
              <Text className="text-base text-ink mt-2 leading-relaxed">
                {query.data.summary}
              </Text>
            </Card>

            {query.data.plans?.map((plan) => <PlanCard key={plan.label} plan={plan} />)}

            <View className="pt-2">
              <Button variant="secondary" onPress={() => router.push("/compare")}>
                Compare with another country
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <Card>
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-3">
          <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
            {plan.label}
          </Text>
          <Text className="text-xl font-semibold text-ink mt-1">
            {plan.country} · {plan.visa}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-3xl font-semibold text-accent">{plan.fit}%</Text>
          <Text className="text-xs text-muted">fit</Text>
        </View>
      </View>
      <Text className="text-sm text-ink mt-3 leading-relaxed">{plan.summary}</Text>

      {plan.timeline || plan.cost_estimate ? (
        <View className="flex-row gap-6 mt-4">
          {plan.timeline ? (
            <View>
              <Text className="text-xs text-muted uppercase tracking-widest">Timeline</Text>
              <Text className="text-sm font-semibold text-ink mt-0.5">{plan.timeline}</Text>
            </View>
          ) : null}
          {plan.cost_estimate ? (
            <View>
              <Text className="text-xs text-muted uppercase tracking-widest">Est. cost</Text>
              <Text className="text-sm font-semibold text-ink mt-0.5">{plan.cost_estimate}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {plan.steps?.length ? (
        <View className="mt-4 gap-2">
          <Text className="text-xs text-muted uppercase tracking-widest">Next steps</Text>
          {plan.steps.map((s, i) => (
            <View key={i} className="flex-row gap-3">
              <Text className="text-sm font-semibold text-accent w-5">{i + 1}.</Text>
              <Text className="text-sm text-ink flex-1">{s}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
