import {
  LANGUAGE_OPTIONS,
  resolvePreferredLanguage
} from "@/lib/i18n";

describe("language switcher helpers", () => {
  it("prefers a supported stored language over the browser language", () => {
    expect(resolvePreferredLanguage("tr", "en-US")).toBe("tr");
  });

  it("falls back to a supported browser language when storage is empty", () => {
    expect(resolvePreferredLanguage(null, "de-DE")).toBe("de");
  });

  it("falls back to english for unsupported values", () => {
    expect(resolvePreferredLanguage("xx", "yy-ZZ")).toBe("en");
  });

  it("keeps the expected language menu ordering", () => {
    expect(LANGUAGE_OPTIONS.map((language) => language.code)).toEqual([
      "ps",
      "bn",
      "pt",
      "zh",
      "cs",
      "fr",
      "de",
      "el",
      "hu",
      "hi",
      "id",
      "fa",
      "he",
      "it",
      "ja",
      "sw",
      "ms",
      "nl",
      "ur",
      "tl",
      "pl",
      "ro",
      "ru",
      "ar",
      "ko",
      "es",
      "th",
      "tr",
      "uk",
      "en",
      "vi"
    ]);
  });
});
