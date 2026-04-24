import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

import type { SelectOption } from "@/lib/profile";

type PillSelectorProps<T extends string> = Readonly<{
  label?: string;
  options: ReadonlyArray<SelectOption<T>>;
  value: T | "";
  onChange: (next: T) => void;
  columns?: 1 | 2;
}>;

export function PillSelector<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 2
}: PillSelectorProps<T>) {
  return (
    <View className="gap-2">
      {label ? <Text className="text-sm font-medium text-ink">{label}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                onChange(opt.value);
              }}
              className={[
                columns === 1 ? "w-full" : "flex-1 min-w-[45%]",
                "px-4 py-3 rounded-2xl border items-center",
                active ? "bg-accent border-accent" : "bg-card border-gray-200"
              ].join(" ")}
              android_ripple={{ color: "#00000011" }}
            >
              <Text
                className={[
                  "text-sm font-medium",
                  active ? "text-white" : "text-ink"
                ].join(" ")}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
