import { Text, View } from "react-native";

type ProgressBarProps = Readonly<{
  step: number;
  total: number;
  label?: string;
}>;

export function ProgressBar({ step, total, label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (step / total) * 100));
  return (
    <View className="gap-2">
      <View className="flex-row justify-between">
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted">
          {label ?? `Step ${step} of ${total}`}
        </Text>
        <Text className="text-xs font-semibold text-accent">{Math.round(pct)}%</Text>
      </View>
      <View className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <View style={{ width: `${pct}%` }} className="h-full bg-accent rounded-full" />
      </View>
    </View>
  );
}
