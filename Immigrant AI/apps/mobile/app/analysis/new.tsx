import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api-client";

/**
 * Kick off a new AI strategy analysis.
 * Mirrors POST /ai/strategy on the web.
 */
export default function NewAnalysisScreen() {
  const [targetCountry, setTargetCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    const res = await api.post<{ id: string }>("/ai/strategy", {
      target_country: targetCountry.trim() || undefined
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    router.replace(`/analysis/${res.data.id}` as never);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="px-5 py-3">
        <Pressable onPress={() => router.back()} className="py-2">
          <Text className="text-accent text-base font-semibold">← Back</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 16 }}>
        <View className="gap-1">
          <Text className="text-3xl font-semibold text-ink">Run a new analysis</Text>
          <Text className="text-sm text-muted">
            We'll combine your profile with live country data and generate a Plan A / B / C.
          </Text>
        </View>

        <Card>
          <Text className="text-sm font-medium text-muted mb-3">
            Optional — focus on a specific country
          </Text>
          <Input
            label="Target country"
            placeholder="Leave blank for best-match recommendation"
            value={targetCountry}
            onChangeText={setTargetCountry}
          />
        </Card>

        {error ? (
          <View className="rounded-2xl bg-red/10 border border-red/20 p-3">
            <Text className="text-sm text-red">{error}</Text>
          </View>
        ) : null}

        <Button fullWidth size="lg" onPress={submit} loading={loading}>
          {loading ? "Analysing…" : "Generate analysis"}
        </Button>

        {loading ? (
          <View className="items-center">
            <ActivityIndicator color="#0071e3" />
            <Text className="text-xs text-muted mt-2">
              Takes 10-20 seconds. Don't close the app.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
