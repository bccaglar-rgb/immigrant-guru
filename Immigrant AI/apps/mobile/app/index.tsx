import { Redirect } from "expo-router";

import { useAuth } from "@/lib/auth";

/** Entry redirect: auth gate. */
export default function Index() {
  const status = useAuth((s) => s.status);
  if (status === "authenticated") return <Redirect href="/(tabs)" />;
  return <Redirect href="/(auth)/sign-in" />;
}
