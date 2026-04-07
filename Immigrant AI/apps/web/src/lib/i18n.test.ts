import {
  getDocumentDirection,
  translateText
} from "@/lib/i18n";

describe("i18n helpers", () => {
  it("returns rtl direction for arabic", () => {
    expect(getDocumentDirection("ar")).toBe("rtl");
    expect(getDocumentDirection("fa")).toBe("rtl");
    expect(getDocumentDirection("ur")).toBe("rtl");
  });

  it("translates shared labels", () => {
    expect(translateText("tr", "Sign in")).toBe("Giriş yap");
    expect(translateText("ar", "Dashboard")).toBe("لوحة التحكم");
  });

  it("falls back to source text when a phrase is unknown", () => {
    expect(translateText("de", "Unknown phrase")).toBe("Unknown phrase");
  });
});
