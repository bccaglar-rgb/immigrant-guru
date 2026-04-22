import { defineRouting } from "next-intl/routing";

import { LANGUAGE_OPTIONS } from "@/lib/i18n";

export const SUPPORTED_LOCALES = LANGUAGE_OPTIONS.map((l) => l.code) as readonly string[];

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES as unknown as string[],
  defaultLocale: "en",
  // `as-needed` keeps English at `/pricing` (existing indexed URLs stay alive)
  // and prefixes other locales like `/tr/pricing`, `/fr/pricing`. hreflang
  // alternates in metadata give Google the per-language signal.
  localePrefix: "as-needed",
  // Detect browser Accept-Language and redirect to the matching locale prefix.
  // English stays at `/` (default), Spanish speakers go to `/es/`, etc.
  localeDetection: true
});
