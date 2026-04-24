import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { Platform, View, type ViewProps } from "react-native";

type CardProps = Readonly<{
  children: ReactNode;
  variant?: "plain" | "glass";
}> &
  ViewProps;

export function Card({ children, variant = "plain", className = "", style, ...rest }: CardProps) {
  if (variant === "glass" && Platform.OS !== "web") {
    return (
      <View
        className={`overflow-hidden rounded-3xl border border-white/20 ${className}`}
        style={style}
        {...rest}
      >
        <BlurView intensity={40} tint="light" className="p-6">
          {children}
        </BlurView>
      </View>
    );
  }

  return (
    <View
      className={`rounded-3xl border border-gray-200 bg-card p-6 ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </View>
  );
}
