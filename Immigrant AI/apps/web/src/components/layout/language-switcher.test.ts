import {
  LANGUAGE_OPTIONS,
  resolvePreferredLanguage
} from "@/components/layout/language-switcher";

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
      "en",
      "tr",
      "de",
      "fr",
      "es",
      "pt",
      "ar",
      "zh",
      "ja",
      "ko",
      "ru",
      "hi"
    ]);
  });
});
