import type { ReactNode } from "react";

// Root layout is intentionally a passthrough — `<html>` and `<body>` are
// rendered in `app/[locale]/layout.tsx` so the `lang` and `dir` attributes
// reflect the active locale (required by next-intl + correct for SEO).
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
