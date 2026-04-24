import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth";
import { getOfferings, purchasePackage } from "@/lib/revenue-cat";

export default function PaywallScreen() {
  const refreshUser = useAuth((s) => s.refreshUser);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const current = await getOfferings();
      setOffering(current);
      setLoading(false);
    })();
  }, []);

  const buy = async (pkg: PurchasesPackage) => {
    setPurchasing(pkg.identifier);
    setError(null);
    const res = await purchasePackage(pkg);
    setPurchasing(null);
    if (!res.ok) {
      if (!res.cancelled) setError(res.error);
      return;
    }
    // Backend receives webhook from RevenueCat and upgrades plan.
    // Pull the new plan into UI immediately.
    await refreshUser();
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View className="gap-2">
          <Text className="text-3xl font-semibold text-ink">Upgrade</Text>
          <Text className="text-base text-muted">
            Unlock full immigration strategies, compare countries, and get a personalized roadmap.
          </Text>
        </View>

        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="#0071e3" />
          </View>
        ) : offering && offering.availablePackages.length > 0 ? (
          offering.availablePackages.map((pkg) => (
            <Card key={pkg.identifier}>
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-4">
                  <Text className="text-lg font-semibold text-ink">
                    {pkg.product.title}
                  </Text>
                  <Text className="text-sm text-muted mt-1">
                    {pkg.product.description}
                  </Text>
                </View>
                <Text className="text-xl font-semibold text-accent">
                  {pkg.product.priceString}
                </Text>
              </View>
              <View className="mt-4">
                <Button
                  fullWidth
                  onPress={() => buy(pkg)}
                  loading={purchasing === pkg.identifier}
                >
                  Subscribe
                </Button>
              </View>
            </Card>
          ))
        ) : (
          <Card>
            <Text className="text-base font-semibold text-ink">No plans available</Text>
            <Text className="text-sm text-muted mt-1">
              Check your internet connection and try again.
            </Text>
          </Card>
        )}

        {error ? (
          <View className="rounded-2xl bg-red/10 border border-red/20 p-3">
            <Text className="text-sm text-red">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row justify-center pt-2">
          <Button variant="ghost" onPress={() => router.back()}>
            Not now
          </Button>
        </View>

        <Text className="text-xs text-muted text-center mt-4 leading-5">
          Subscriptions auto-renew until cancelled at least 24 hours before the end of the current
          period. Manage or cancel anytime in your device's subscription settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
