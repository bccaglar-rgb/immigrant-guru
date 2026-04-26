import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "../global.css";

import { useAuth } from "@/lib/auth";
import { configureRevenueCat } from "@/lib/revenue-cat";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1
    }
  }
});

export default function RootLayout() {
  const hydrate = useAuth((s) => s.hydrate);
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    (async () => {
      await configureRevenueCat(user?.id);
      await hydrate();
      await SplashScreen.hideAsync().catch(() => undefined);
    })();
    // intentional: one-time bootstrap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.id) void configureRevenueCat(user.id);
  }, [user?.id]);

  // Map incoming universal links (https://immigrant.guru/app/<route>) to
  // Expo Router paths so the app picks up password-reset / verify emails.
  useEffect(() => {
    const handle = (url: string) => {
      try {
        const parsed = Linking.parse(url);
        const path = parsed.path ?? "";
        const params = parsed.queryParams ?? {};
        // /app/reset-password?token=XYZ  →  (auth)/reset-password
        if (path.includes("reset-password")) {
          router.push({ pathname: "/(auth)/reset-password", params });
          return;
        }
        if (path.includes("verify")) {
          router.push({ pathname: "/(auth)/verify", params });
          return;
        }
      } catch {
        // ignore invalid URLs
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handle(url);
    });
    const sub = Linking.addEventListener("url", (event) => handle(event.url));
    return () => sub.remove();
  }, []);

  if (status === "loading") return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(public)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
            <Stack.Screen name="visa/[slug]" />
            <Stack.Screen name="compare" />
            <Stack.Screen name="analysis/[id]" />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
