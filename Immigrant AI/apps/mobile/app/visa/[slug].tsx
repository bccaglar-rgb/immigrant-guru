import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api-client";

type VisaDetail = {
  slug: string;
  name: string;
  country: string;
  description: string;
  duration?: string;
  cost?: string;
  processing_time?: string;
  eligibility?: string[];
  documents?: string[];
  pros?: string[];
  cons?: string[];
};

export default function VisaDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const query = useQuery<VisaDetail>({
    queryKey: ["visa", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const res = await api.get<VisaDetail>(`/knowledge/visa/${slug}`);
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
            <Text className="text-base font-semibold text-ink">Visa not found</Text>
            <Text className="text-sm text-muted mt-1">
              We couldn't load this visa. Try again later.
            </Text>
          </Card>
        ) : (
          <>
            <View>
              <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
                {query.data.country}
              </Text>
              <Text className="text-3xl font-semibold text-ink mt-1">{query.data.name}</Text>
              <Text className="text-base text-muted mt-2 leading-relaxed">
                {query.data.description}
              </Text>
            </View>

            <Card>
              <View className="flex-row flex-wrap gap-6">
                {query.data.duration ? (
                  <Stat label="Duration" value={query.data.duration} />
                ) : null}
                {query.data.cost ? <Stat label="Cost" value={query.data.cost} /> : null}
                {query.data.processing_time ? (
                  <Stat label="Processing" value={query.data.processing_time} />
                ) : null}
              </View>
            </Card>

            {query.data.eligibility?.length ? (
              <List title="Eligibility" items={query.data.eligibility} />
            ) : null}
            {query.data.documents?.length ? (
              <List title="Required documents" items={query.data.documents} />
            ) : null}
            {query.data.pros?.length ? (
              <List title="Advantages" items={query.data.pros} accent />
            ) : null}
            {query.data.cons?.length ? (
              <List title="Considerations" items={query.data.cons} />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs uppercase tracking-widest text-muted">{label}</Text>
      <Text className="text-base font-semibold text-ink mt-0.5">{value}</Text>
    </View>
  );
}

function List({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <Card>
      <Text className="text-sm font-medium text-muted mb-3">{title}</Text>
      <View className="gap-2">
        {items.map((item, i) => (
          <View key={i} className="flex-row gap-3">
            <Text className={`text-sm ${accent ? "text-accent" : "text-muted"} w-3`}>•</Text>
            <Text className="text-sm text-ink flex-1 leading-relaxed">{item}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
