import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api-client";

type AnalysisItem = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
};

export default function AnalysisScreen() {
  const query = useQuery<AnalysisItem[]>({
    queryKey: ["analyses"],
    queryFn: async () => {
      const res = await api.get<AnalysisItem[]>("/ai/analyses");
      if (!res.ok) throw new Error(res.message);
      return res.data;
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-semibold text-ink">My Analysis</Text>
            <Text className="text-sm text-muted">Your AI-generated immigration strategies.</Text>
          </View>
          <Button size="sm" onPress={() => router.push("/analysis/new" as never)}>
            New
          </Button>
        </View>

        {query.isLoading ? (
          <Card>
            <Text className="text-sm text-muted">Loading…</Text>
          </Card>
        ) : query.data && query.data.length > 0 ? (
          query.data.map((a) => (
            <Pressable key={a.id} onPress={() => router.push(`/analysis/${a.id}` as never)}>
              <Card>
                <Text className="text-base font-semibold text-ink">{a.title}</Text>
                <Text className="text-sm text-muted mt-1" numberOfLines={2}>
                  {a.summary}
                </Text>
                <Text className="text-xs text-muted mt-2">
                  {new Date(a.createdAt).toLocaleDateString()}
                </Text>
              </Card>
            </Pressable>
          ))
        ) : (
          <Card>
            <Text className="text-base font-semibold text-ink">No analyses yet</Text>
            <Text className="text-sm text-muted mt-1">
              Complete your profile and run your first AI analysis.
            </Text>
            <View className="mt-3">
              <Button onPress={() => router.push("/onboarding")}>Start profile</Button>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
