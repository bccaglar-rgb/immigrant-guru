import { Redirect } from "expo-router";
import { View } from "react-native";

import { useAuth } from "@/lib/auth";

/** Entry redirect: wait for hydration, then route to tabs or landing. */
export default function Index() {
  const status = useAuth((s) => s.status);
  if (status === "loading") return <View className="flex-1 bg-bg" />;
  if (status === "authenticated") return <Redirect href="/(tabs)" />;
  return <Redirect href="/(public)/landing" />;
}
