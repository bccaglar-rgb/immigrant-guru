import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, type PressableProps, Text } from "react-native";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

type ButtonProps = Readonly<{
  children: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  hapticsStyle?: Haptics.ImpactFeedbackStyle;
}> &
  Omit<PressableProps, "onPress" | "children" | "style">;

const base = "items-center justify-center rounded-2xl";

const variants: Record<Variant, { container: string; text: string; pressed: string }> = {
  primary: {
    container: "bg-accent",
    text: "text-white font-semibold",
    pressed: "bg-accent-hover"
  },
  secondary: {
    container: "bg-card border border-gray-200",
    text: "text-ink font-semibold",
    pressed: "bg-gray-100"
  },
  ghost: {
    container: "bg-transparent",
    text: "text-accent font-semibold",
    pressed: "bg-gray-100"
  },
  destructive: {
    container: "bg-red",
    text: "text-white font-semibold",
    pressed: "bg-red/90"
  }
};

const sizes: Record<Size, { container: string; text: string }> = {
  sm: { container: "px-3 h-9", text: "text-sm" },
  md: { container: "px-4 h-11", text: "text-base" },
  lg: { container: "px-5 h-14", text: "text-base" }
};

export function Button({
  children,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  hapticsStyle = Haptics.ImpactFeedbackStyle.Light,
  ...rest
}: ButtonProps) {
  const v = variants[variant];
  const s = sizes[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      onPress={() => {
        if (isDisabled) return;
        Haptics.impactAsync(hapticsStyle).catch(() => undefined);
        onPress?.();
      }}
      className={[
        base,
        v.container,
        s.container,
        fullWidth ? "w-full" : "",
        isDisabled ? "opacity-50" : ""
      ].join(" ")}
      android_ripple={{ color: "#00000022" }}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "destructive" ? "#fff" : "#0071e3"} />
      ) : typeof children === "string" ? (
        <Text className={[v.text, s.text].join(" ")}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
