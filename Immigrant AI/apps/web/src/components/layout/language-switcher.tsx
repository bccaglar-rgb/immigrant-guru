"use client";

import { useEffect, useRef, useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";
import {
  LANGUAGE_OPTIONS,
  STORAGE_KEY,
  type LanguageCode,
  resolvePreferredLanguage
} from "@/lib/i18n";

type LanguageSwitcherProps = Readonly<{
  align?: "left" | "right";
  compact?: boolean;
}>;

export function LanguageSwitcher({
  align = "right",
  compact = false
}: LanguageSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { locale, setLocale } = useLocale();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextLanguage = resolvePreferredLanguage(
      window.localStorage.getItem(STORAGE_KEY),
      window.navigator.language
    );

    if (nextLanguage !== locale) {
      setLocale(nextLanguage);
    }
  }, [locale, setLocale]);

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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const selectedLanguage =
    LANGUAGE_OPTIONS.find((language) => language.code === locale) ??
    LANGUAGE_OPTIONS[0];

  function handleSelect(code: LanguageCode) {
    setLocale(code);
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
            {LANGUAGE_OPTIONS.map((language) => {
              const active = language.code === locale;

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
