import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";

export default function CompareScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View>
          <Text className="text-2xl font-semibold text-ink">Compare</Text>
          <Text className="text-sm text-muted">
            Compare up to 3 countries side-by-side on visa options, cost, and timeline.
          </Text>
        </View>
        <Card>
          <Text className="text-base font-semibold text-ink">Coming soon</Text>
          <Text className="text-sm text-muted mt-1">
            Mirrors /compare on the web.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
