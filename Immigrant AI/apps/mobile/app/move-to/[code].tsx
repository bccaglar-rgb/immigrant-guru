import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api-client";

type CountryDetail = {
  name: string;
  code: string;
  summary: string;
  overview: { cost_of_living: string; safety: string; climate: string; language: string };
  visas: Array<{ slug: string; name: string; fit?: number }>;
  cities?: Array<{ name: string; description: string }>;
};

export default function MoveToScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const query = useQuery<CountryDetail>({
    queryKey: ["country", code],
    enabled: Boolean(code),
    queryFn: async () => {
      const res = await api.get<CountryDetail>(`/knowledge/country/${code}`);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="px-5 py-3">
        <Pressable onPress={() => router.back()} className="py-2">
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
            <Text className="text-base font-semibold text-ink">Country not found</Text>
          </Card>
        ) : (
          <>
            <View>
              <Text className="text-3xl font-semibold text-ink">{query.data.name}</Text>
              <Text className="text-base text-muted mt-2 leading-relaxed">
                {query.data.summary}
              </Text>
            </View>

            <Card>
              <View className="flex-row flex-wrap gap-5">
                <Detail label="Cost" value={query.data.overview.cost_of_living} />
                <Detail label="Safety" value={query.data.overview.safety} />
                <Detail label="Climate" value={query.data.overview.climate} />
                <Detail label="Language" value={query.data.overview.language} />
              </View>
            </Card>

            <Card>
              <Text className="text-sm font-medium text-muted mb-3">Visa options</Text>
              <View className="gap-2">
                {query.data.visas.map((v) => (
                  <Pressable
                    key={v.slug}
                    onPress={() => router.push(`/visa/${v.slug}` as never)}
                    className="flex-row justify-between items-center py-2"
                  >
                    <Text className="text-base text-ink flex-1">{v.name}</Text>
                    {typeof v.fit === "number" ? (
                      <Text className="text-sm font-semibold text-accent">{v.fit}%</Text>
                    ) : (
                      <Text className="text-sm text-muted">›</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            </Card>

            {query.data.cities?.length ? (
              <Card>
                <Text className="text-sm font-medium text-muted mb-3">Cities</Text>
                <View className="gap-3">
                  {query.data.cities.map((c) => (
                    <View key={c.name}>
                      <Text className="text-base font-semibold text-ink">{c.name}</Text>
                      <Text className="text-sm text-muted mt-0.5 leading-relaxed">
                        {c.description}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs uppercase tracking-widest text-muted">{label}</Text>
      <Text className="text-sm font-semibold text-ink mt-0.5">{value}</Text>
    </View>
  );
}
