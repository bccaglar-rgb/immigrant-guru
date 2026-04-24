/** Brand palette — mirrors apps/web tailwind config. */
export const colors = {
  ink: "#111827",
  muted: "#6b7280",
  accent: "#0071e3",
  accentHover: "#0077ed",
  red: "#ff3b30",
  bg: "#f5f5f7",
  card: "#ffffff",
  border: "#e5e7eb",
  gradient: ["#0071e3", "#5e5ce6", "#bf5af2"] as const
} as const;

export type ColorKey = keyof typeof colors;
