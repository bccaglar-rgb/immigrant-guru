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
    // Persist the choice, then hard-reload. The MutationObserver-based
    // translator fights React reconciliation when switching in place; a fresh
    // page load sidesteps the race entirely and the observer runs cleanly
    // against the post-hydration DOM.
    if (code === locale) {
      setIsOpen(false);
      return;
    }
    setIsOpen(false);
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, code);
    // Do NOT call setLocale — a React re-render would re-run the observer
    // effect against the already-translated DOM and crash before reload fires.
    window.location.reload();
  }

  return (
    <div className="relative" ref={containerRef} data-no-translate="true">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Select language"
        translate="no"
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
            "absolute top-[calc(100%+0.5rem)] z-50 w-[320px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_20px_50px_rgba(15,23,42,0.18)]",
            align === "right" ? "right-0" : "left-0"
          )}
          role="menu"
        >
          <div className="border-b border-line/70 px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Language
            </p>
          </div>

          <div className="grid max-h-[320px] grid-cols-2 gap-0.5 overflow-y-auto p-1.5">
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
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150",
                    active
                      ? "bg-accent/10 font-semibold text-accent"
                      : "text-ink hover:bg-canvas"
                  )}
                >
                  <span className="text-base leading-none">{language.flag}</span>
                  <span className="flex-1 truncate">{language.label}</span>
                  {active ? <span className="text-xs">✓</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
