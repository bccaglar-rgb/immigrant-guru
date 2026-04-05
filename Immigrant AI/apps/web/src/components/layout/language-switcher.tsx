"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const STORAGE_KEY = "immigrant-guru-language";

const languages = [
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "tr", flag: "🇹🇷", label: "Türkçe" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "pt", flag: "🇧🇷", label: "Português" },
  { code: "ar", flag: "🇸🇦", label: "العربية" },
  { code: "zh", flag: "🇨🇳", label: "中文" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "ko", flag: "🇰🇷", label: "한국어" },
  { code: "ru", flag: "🇷🇺", label: "Русский" },
  { code: "hi", flag: "🇮🇳", label: "हिंदी" }
] as const;

type LanguageCode = (typeof languages)[number]["code"];

type LanguageSwitcherProps = Readonly<{
  align?: "left" | "right";
  compact?: boolean;
}>;

function getInitialLanguage(): LanguageCode {
  if (typeof window === "undefined") {
    return "en";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && languages.some((language) => language.code === stored)) {
    return stored as LanguageCode;
  }

  const browserLanguage = window.navigator.language.toLowerCase().split("-")[0];
  if (languages.some((language) => language.code === browserLanguage)) {
    return browserLanguage as LanguageCode;
  }

  return "en";
}

export function LanguageSwitcher({
  align = "right",
  compact = false
}: LanguageSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState<LanguageCode>("en");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nextLanguage = getInitialLanguage();
    setSelectedCode(nextLanguage);
    document.documentElement.lang = nextLanguage;
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const selectedLanguage =
    languages.find((language) => language.code === selectedCode) ?? languages[0];

  function handleSelect(code: LanguageCode) {
    setSelectedCode(code);
    document.documentElement.lang = code;
    window.localStorage.setItem(STORAGE_KEY, code);
    setIsOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Select language"
        className={cn(
          "inline-flex items-center justify-center rounded-full border border-line bg-white/85 text-ink shadow-soft transition-all duration-200 hover:border-accent/35 hover:bg-white",
          compact ? "h-10 min-w-10 px-3" : "h-11 min-w-11 px-3.5"
        )}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="text-lg leading-none">{selectedLanguage.flag}</span>
      </button>

      {isOpen ? (
        <div
          className={cn(
            "absolute top-[calc(100%+0.75rem)] z-50 w-[220px] overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]",
            align === "right" ? "right-0" : "left-0"
          )}
          role="menu"
        >
          <div className="px-5 pb-3 pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Language
            </p>
          </div>

          <div className="pb-3">
            {languages.map((language) => {
              const active = language.code === selectedCode;

              return (
                <button
                  key={language.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => handleSelect(language.code)}
                  className={cn(
                    "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors duration-150",
                    active ? "bg-[#eef4ff] text-[#13376b]" : "text-ink hover:bg-canvas"
                  )}
                >
                  <span className="text-xl leading-none">{language.flag}</span>
                  <span className="flex-1 truncate text-base font-medium">
                    {language.label}
                  </span>
                  <span
                    className={cn(
                      "text-base font-semibold text-accent transition-opacity",
                      active ? "opacity-100" : "opacity-0"
                    )}
                  >
                    ✓
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
