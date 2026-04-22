import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

// Server-side per-request locale config. Messages are loaded dynamically so
// build output doesn't balloon; falls back to English on missing locale.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  let messages: Record<string, unknown> = {};
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    messages = (await import(`../../messages/${routing.defaultLocale}.json`)).default;
  }

  return {
    locale,
    messages,
    // Keys are the English source strings themselves. When a locale's JSON
    // doesn't have a key yet, fall back to the key (English) instead of
    // throwing — this lets us migrate pages to t() incrementally without
    // breaking locales whose messages/{locale}.json hasn't been populated.
    onError: () => {},
    getMessageFallback: ({ key }) => key
  };
});
