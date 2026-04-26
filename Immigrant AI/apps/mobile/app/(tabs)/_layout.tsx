import { Tabs } from "expo-router";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

import { colors } from "@/theme/colors";

// ── Tab SVG icons ─────────────────────────────────────────────────────────────
function TabGrid({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="3" width="7" height="7" />
      <Rect x="14" y="3" width="7" height="7" />
      <Rect x="3" y="14" width="7" height="7" />
      <Rect x="14" y="14" width="7" height="7" />
    </Svg>
  );
}

function TabBarChart({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="2" y="10" width="4" height="12" />
      <Rect x="9" y="4" width="4" height="18" />
      <Rect x="16" y="7" width="4" height="15" />
    </Svg>
  );
}

function TabGlobe({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Line x1="2" y1="12" x2="22" y2="12" />
      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  );
}


function TabPerson({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Svg>
  );
}

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
        options={{
          title: "Dashboard",
          headerShown: false,
          tabBarIcon: ({ color }) => <TabGrid color={color} />
        }}
      />
      <Tabs.Screen
        name="analysis"
        options={{
          title: "Analysis",
          headerTitle: "My Analysis",
          tabBarIcon: ({ color }) => <TabBarChart color={color} />
        }}
      />
      <Tabs.Screen
        name="best-countries"
        options={{
          title: "Explore",
          headerTitle: "Best Countries",
          tabBarIcon: ({ color }) => <TabGlobe color={color} />
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          headerTitle: "Settings",
          tabBarIcon: ({ color }) => <TabPerson color={color} />
        }}
      />
    </Tabs>
  );
}
