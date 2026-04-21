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
  // Browser detection is handled client-side (legacy behavior). We don't want
  // middleware to redirect English visitors away from their indexed URLs.
  localeDetection: false
});
