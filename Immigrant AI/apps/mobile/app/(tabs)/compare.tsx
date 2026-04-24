import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api-client";

type CompareResult = {
  countries: Array<{
    name: string;
    code: string;
    metrics: {
      cost_of_living: string;
      visa_ease: string;
      english_friendly: string;
      job_market: string;
      path_to_residency: string;
    };
  }>;
  winner?: { name: string; reason: string };
};

const MAX = 3;

export default function CompareScreen() {
  const [input, setInput] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation<CompareResult, Error, string[]>({
    mutationFn: async (list) => {
      const res = await api.post<CompareResult>("/ai/compare", { countries: list });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    }
  });

  const add = () => {
    const name = input.trim();
    if (!name) return;
    if (countries.length >= MAX) return setError(`Add up to ${MAX} countries.`);
    if (countries.includes(name)) return setError("Already added.");
    setCountries([...countries, name]);
    setInput("");
    setError(null);
  };

  const remove = (name: string) => {
    setCountries(countries.filter((c) => c !== name));
    mutation.reset();
  };

  const run = () => {
    if (countries.length < 2) return setError("Add at least 2 countries to compare.");
    setError(null);
    mutation.mutate(countries);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View>
          <Text className="text-2xl font-semibold text-ink">Compare countries</Text>
          <Text className="text-sm text-muted mt-1">
            Pick up to 3 countries. We'll put them side-by-side across visa, cost, language, and
            jobs.
          </Text>
        </View>

        <Card>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Input
                placeholder="e.g. Canada"
                value={input}
                onChangeText={setInput}
                onSubmitEditing={add}
                returnKeyType="done"
              />
            </View>
            <Button onPress={add}>Add</Button>
          </View>
          {countries.length > 0 ? (
            <View className="flex-row flex-wrap gap-2 mt-4">
              {countries.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => remove(c)}
                  className="px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 flex-row items-center gap-2"
                >
                  <Text className="text-sm text-accent font-medium">{c}</Text>
                  <Text className="text-accent">×</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Card>

        {error ? (
          <View className="rounded-2xl bg-red/10 border border-red/20 p-3">
            <Text className="text-sm text-red">{error}</Text>
          </View>
        ) : null}

        <Button
          fullWidth
          size="lg"
          onPress={run}
          loading={mutation.isPending}
          disabled={countries.length < 2}
        >
          Compare
        </Button>

        {mutation.data ? (
          <View className="gap-3">
            {mutation.data.winner ? (
              <Card>
                <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
                  Best match
                </Text>
                <Text className="text-xl font-semibold text-ink mt-1">
                  {mutation.data.winner.name}
                </Text>
                <Text className="text-sm text-muted mt-1 leading-relaxed">
                  {mutation.data.winner.reason}
                </Text>
              </Card>
            ) : null}
            {mutation.data.countries.map((country) => (
              <Card key={country.code}>
                <Text className="text-lg font-semibold text-ink">{country.name}</Text>
                <View className="mt-3 gap-2">
                  <Metric label="Visa ease" value={country.metrics.visa_ease} />
                  <Metric label="Cost of living" value={country.metrics.cost_of_living} />
                  <Metric label="English-friendly" value={country.metrics.english_friendly} />
                  <Metric label="Job market" value={country.metrics.job_market} />
                  <Metric label="Path to residency" value={country.metrics.path_to_residency} />
                </View>
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-sm text-muted">{label}</Text>
      <Text className="text-sm font-medium text-ink">{value}</Text>
    </View>
  );
}
