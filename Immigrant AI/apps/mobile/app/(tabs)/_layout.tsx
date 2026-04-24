import { Tabs } from "expo-router";

import { colors } from "@/theme/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.card,
          height: 84,
          paddingBottom: 28,
          paddingTop: 8
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.ink, fontWeight: "600" }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Dashboard", headerTitle: "Dashboard" }}
      />
      <Tabs.Screen
        name="analysis"
        options={{ title: "Analysis", headerTitle: "My Analysis" }}
      />
      <Tabs.Screen
        name="best-countries"
        options={{ title: "Explore", headerTitle: "Best Countries" }}
      />
      <Tabs.Screen
        name="compare"
        options={{ title: "Compare", headerTitle: "Compare" }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", headerTitle: "Settings" }}
      />
    </Tabs>
  );
}
