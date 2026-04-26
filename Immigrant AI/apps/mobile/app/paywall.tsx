import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth";
import { getOfferings, purchasePackage, restorePurchases } from "@/lib/revenue-cat";

export default function PaywallScreen() {
  const { required } = useLocalSearchParams<{ required?: string }>();
  const isRequired = required === "true";

  const refreshUser = useAuth((s) => s.refreshUser);
  const signOut = useAuth((s) => s.signOut);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOfferings().then((o) => {
      setOffering(o);
      setLoading(false);
    });
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
    await refreshUser();
    router.replace("/(tabs)");
  };

  const onRestore = async () => {
    setRestoring(true);
    await restorePurchases();
    await refreshUser();
    setRestoring(false);
    router.replace("/(tabs)");
  };

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View className="gap-2">
          <Text className="text-sm font-semibold uppercase tracking-widest text-accent">
            Immigrant Guru
          </Text>
          <Text className="text-3xl font-semibold text-ink">Start your plan</Text>
          <Text className="text-base text-muted">
            Unlock AI immigration strategies, country comparisons, and a personalised roadmap.
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
                  <Text className="text-lg font-semibold text-ink">{pkg.product.title}</Text>
                  <Text className="text-sm text-muted mt-1">{pkg.product.description}</Text>
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

        <Button variant="secondary" onPress={onRestore} loading={restoring}>
          Restore purchases
        </Button>

        {isRequired ? (
          <Button
            variant="ghost"
            onPress={async () => {
              await signOut();
              router.replace("/(auth)/sign-in");
            }}
          >
            Sign out
          </Button>
        ) : (
          <Button variant="ghost" onPress={dismiss}>
            Not now
          </Button>
        )}

        <Text className="text-xs text-muted text-center mt-2 leading-5">
          Subscriptions auto-renew until cancelled at least 24 hours before the end of the
          current period. Manage or cancel anytime in your device's subscription settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
