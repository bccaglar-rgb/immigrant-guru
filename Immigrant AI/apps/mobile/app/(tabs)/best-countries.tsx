import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api-client";

type CountryRec = {
  country: string;
  country_code: string;
  fit: number;          // 0-100
  top_visa: string;
  summary: string;
  cost_of_living?: string;
  visa_difficulty?: string;
};

export default function BestCountriesScreen() {
  const query = useQuery<CountryRec[]>({
    queryKey: ["best-countries"],
    queryFn: async () => {
      const res = await api.get<CountryRec[]>("/ai/best-countries");
      if (!res.ok) throw new Error(res.message);
      return res.data;
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View>
          <Text className="text-2xl font-semibold text-ink">Best countries for you</Text>
          <Text className="text-sm text-muted mt-1">
            Ranked by fit with your profile, goals, and current market demand.
          </Text>
        </View>

        {query.isLoading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="#0071e3" />
          </View>
        ) : query.data && query.data.length > 0 ? (
          query.data.map((c) => (
            <Pressable
              key={c.country_code}
              onPress={() => router.push(`/move-to/${c.country_code}` as never)}
            >
              <Card>
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-xl font-semibold text-ink">{c.country}</Text>
                    <Text className="text-sm text-muted mt-0.5">
                      Top match: {c.top_visa}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-3xl font-semibold text-accent">{c.fit}%</Text>
                    <Text className="text-xs text-muted">fit</Text>
                  </View>
                </View>
                <Text className="text-sm text-ink mt-3 leading-relaxed" numberOfLines={3}>
                  {c.summary}
                </Text>
                {c.cost_of_living || c.visa_difficulty ? (
                  <View className="flex-row gap-6 mt-3">
                    {c.cost_of_living ? (
                      <View>
                        <Text className="text-xs text-muted uppercase tracking-widest">
                          Cost
                        </Text>
                        <Text className="text-xs font-semibold text-ink mt-0.5">
                          {c.cost_of_living}
                        </Text>
                      </View>
                    ) : null}
                    {c.visa_difficulty ? (
                      <View>
                        <Text className="text-xs text-muted uppercase tracking-widest">
                          Visa
                        </Text>
                        <Text className="text-xs font-semibold text-ink mt-0.5">
                          {c.visa_difficulty}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Card>
            </Pressable>
          ))
        ) : (
          <Card>
            <Text className="text-base font-semibold text-ink">No recommendations yet</Text>
            <Text className="text-sm text-muted mt-1">
              Complete your profile and we'll rank the best countries for you.
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
