import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Onboarding — multi-step profile builder.
 *
 * TODO: port /onboarding flow from apps/web. Steps:
 *   1. Citizenship + current residence
 *   2. Goal (work / study / family / invest / retire)
 *   3. Education + experience
 *   4. Income + savings
 *   5. Language + dependents
 * Writes to POST /profile in small increments.
 */
export default function OnboardingScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View>
          <Text className="text-3xl font-semibold text-ink">Build your profile</Text>
          <Text className="text-base text-muted mt-1">
            A few quick steps so we can match you with the right immigration paths.
          </Text>
        </View>
        <Card>
          <Text className="text-base font-semibold text-ink">Profile wizard coming soon</Text>
          <Text className="text-sm text-muted mt-1">
            The mobile onboarding flow is being ported from the web experience.
          </Text>
        </Card>
        <Button onPress={() => router.replace("/(tabs)")}>Skip for now</Button>
      </ScrollView>
    </SafeAreaView>
  );
}
