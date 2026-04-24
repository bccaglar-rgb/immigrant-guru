import { forwardRef } from "react";
import { Text, TextInput, type TextInputProps, View } from "react-native";

type InputProps = Readonly<{
  label?: string;
  error?: string;
  hint?: string;
}> &
  TextInputProps;

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, editable = true, ...rest },
  ref
) {
  return (
    <View className="w-full gap-1.5">
      {label ? (
        <Text className="text-sm font-medium text-ink">{label}</Text>
      ) : null}
      <TextInput
        ref={ref}
        editable={editable}
        placeholderTextColor="#9ca3af"
        className={[
          "h-12 rounded-2xl border px-4 text-base text-ink bg-card",
          error ? "border-red" : "border-gray-200",
          editable ? "" : "opacity-60"
        ].join(" ")}
        {...rest}
      />
      {error ? (
        <Text className="text-xs text-red">{error}</Text>
      ) : hint ? (
        <Text className="text-xs text-muted">{hint}</Text>
      ) : null}
    </View>
  );
});
