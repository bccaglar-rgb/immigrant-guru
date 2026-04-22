import type { Metadata } from "next";

import { routing } from "@/i18n/routing";

const SITE_URL = "https://immigrant.guru";

/**
 * Builds locale-aware `alternates` for a given path.
 * `as-needed` routing: English lives at `/path`, others at `/<locale>/path`.
 * Every page that sets its own `alternates` must call this to preserve hreflang.
 */
export function buildAlternates(path: string): NonNullable<Metadata["alternates"]> {
  const normalized = path === "/" ? "" : path;
  const canonical = `${SITE_URL}${normalized || "/"}`;

  const languages: Record<string, string> = {};
  for (const code of routing.locales) {
    languages[code] =
      code === routing.defaultLocale
        ? `${SITE_URL}${normalized || "/"}`
        : `${SITE_URL}/${code}${normalized}`;
  }
  languages["x-default"] = `${SITE_URL}${normalized || "/"}`;

  return { canonical, languages };
}
