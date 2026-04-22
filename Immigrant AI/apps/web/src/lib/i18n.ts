// Language metadata + helpers. Actual translation is handled by next-intl
// (messages/{locale}.json + useTranslations/getTranslations). Do NOT reintroduce
// runtime DOM rewriting here — translation is SSR-only.
export const STORAGE_KEY = "immigrant-guru-language";

// Sorted alphabetically by English country name.
// Labels are country names in each country's native language.
export const LANGUAGE_OPTIONS = [
  { code: "ps", flag: "🇦🇫", label: "افغانستان" },      // Afghanistan — Pashto
  { code: "bn", flag: "🇧🇩", label: "বাংলাদেশ" },       // Bangladesh — Bengali
  { code: "pt", flag: "🇧🇷", label: "Brasil" },         // Brazil — Portuguese
  { code: "zh", flag: "🇨🇳", label: "中国" },            // China — Mandarin
  { code: "cs", flag: "🇨🇿", label: "Česko" },          // Czechia — Czech
  { code: "fr", flag: "🇫🇷", label: "France" },         // France — French
  { code: "de", flag: "🇩🇪", label: "Deutschland" },    // Germany — German
  { code: "el", flag: "🇬🇷", label: "Ελλάδα" },         // Greece — Greek
  { code: "hu", flag: "🇭🇺", label: "Magyarország" },   // Hungary — Hungarian
  { code: "hi", flag: "🇮🇳", label: "भारत" },            // India — Hindi
  { code: "id", flag: "🇮🇩", label: "Indonesia" },      // Indonesia — Indonesian
  { code: "fa", flag: "🇮🇷", label: "ایران" },           // Iran — Persian
  { code: "he", flag: "🇮🇱", label: "ישראל" },           // Israel — Hebrew
  { code: "it", flag: "🇮🇹", label: "Italia" },         // Italy — Italian
  { code: "ja", flag: "🇯🇵", label: "日本" },            // Japan — Japanese
  { code: "sw", flag: "🇰🇪", label: "Kenya" },          // Kenya — Swahili
  { code: "ms", flag: "🇲🇾", label: "Malaysia" },       // Malaysia — Malay
  { code: "nl", flag: "🇳🇱", label: "Nederland" },      // Netherlands — Dutch
  { code: "ur", flag: "🇵🇰", label: "پاکستان" },         // Pakistan — Urdu
  { code: "tl", flag: "🇵🇭", label: "Pilipinas" },      // Philippines — Filipino
  { code: "pl", flag: "🇵🇱", label: "Polska" },         // Poland — Polish
  { code: "ro", flag: "🇷🇴", label: "România" },        // Romania — Romanian
  { code: "ru", flag: "🇷🇺", label: "Россия" },          // Russia — Russian
  { code: "ar", flag: "🇸🇦", label: "السعودية" },        // Saudi Arabia — Arabic
  { code: "ko", flag: "🇰🇷", label: "대한민국" },         // South Korea — Korean
  { code: "es", flag: "🇪🇸", label: "España" },         // Spain — Spanish
  { code: "th", flag: "🇹🇭", label: "ประเทศไทย" },      // Thailand — Thai
  { code: "tr", flag: "🇹🇷", label: "Türkiye" },        // Turkey — Turkish
  { code: "uk", flag: "🇺🇦", label: "Україна" },         // Ukraine — Ukrainian
  { code: "en", flag: "🇺🇸", label: "United States" },  // USA — English
  { code: "vi", flag: "🇻🇳", label: "Việt Nam" }        // Vietnam — Vietnamese
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["code"];

export function resolvePreferredLanguage(
  storedLanguage: string | null | undefined,
  browserLanguage: string | null | undefined
): LanguageCode {
  if (
    storedLanguage &&
    LANGUAGE_OPTIONS.some((language) => language.code === storedLanguage)
  ) {
    return storedLanguage as LanguageCode;
  }

  const normalizedBrowserLanguage = browserLanguage?.toLowerCase().split("-")[0];
  if (
    normalizedBrowserLanguage &&
    LANGUAGE_OPTIONS.some((language) => language.code === normalizedBrowserLanguage)
  ) {
    return normalizedBrowserLanguage as LanguageCode;
  }

  return "en";
}

export function isRtlLanguage(locale: LanguageCode): boolean {
  return (
    locale === "ar" ||
    locale === "fa" ||
    locale === "ur" ||
    locale === "he" ||
    locale === "ps"
  );
}

export function getDocumentDirection(locale: LanguageCode): "ltr" | "rtl" {
  return isRtlLanguage(locale) ? "rtl" : "ltr";
}
