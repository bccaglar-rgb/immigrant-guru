import { View, ViewStyle } from "react-native";

type Props = {
  colors: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: ViewStyle | ViewStyle[] | null;
  children?: React.ReactNode;
};

/** Drop-in LinearGradient using the first color — works in Expo Go without native build. */
export function LinearGradient({ colors, style, children }: Props) {
  return (
    <View style={[style, { backgroundColor: colors[0] ?? "transparent" }]}>
      {children}
    </View>
  );
}
