import { router } from "expo-router";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth";
import { restorePurchases } from "@/lib/revenue-cat";

export default function SettingsScreen() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const refreshUser = useAuth((s) => s.refreshUser);

  const confirmLogout = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/sign-in");
        }
      }
    ]);
  };

  const onRestore = async () => {
    const info = await restorePurchases();
    await refreshUser();
    Alert.alert(
      "Restore",
      info ? "Purchases restored." : "No purchases found for this account."
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Card>
          <Text className="text-sm font-medium text-muted">Account</Text>
          <Text className="text-lg font-semibold text-ink mt-1">{user?.email}</Text>
          <Text className="text-sm text-muted mt-1 capitalize">Plan: {user?.plan ?? "free"}</Text>
        </Card>

        <Card>
          <Text className="text-sm font-medium text-muted mb-3">Subscription</Text>
          <View className="gap-2">
            <Button variant="secondary" onPress={() => router.push("/paywall")}>
              Manage plan
            </Button>
            <Button variant="secondary" onPress={onRestore}>
              Restore purchases
            </Button>
          </View>
        </Card>

        <Card>
          <Text className="text-sm font-medium text-muted mb-3">Legal</Text>
          <View className="gap-2">
            <Button variant="ghost" onPress={() => router.push("/legal/terms" as never)}>
              Terms of Service
            </Button>
            <Button variant="ghost" onPress={() => router.push("/legal/privacy" as never)}>
              Privacy Policy
            </Button>
          </View>
        </Card>

        <Button variant="destructive" onPress={confirmLogout}>
          Sign out
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
