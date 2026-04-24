import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";

export default function BestCountriesScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View>
          <Text className="text-2xl font-semibold text-ink">Best countries for you</Text>
          <Text className="text-sm text-muted">
            AI-ranked destinations based on your profile, goals, and market demand.
          </Text>
        </View>
        <Card>
          <Text className="text-base font-semibold text-ink">Coming soon</Text>
          <Text className="text-sm text-muted mt-1">
            This tab mirrors /best-countries on the web. Wiring in progress.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
