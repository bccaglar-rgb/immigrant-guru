"use client";

import { useLocale as useIntlLocale } from "next-intl";
import { useTransition } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef
} from "react";
import type { ReactNode } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import {
  queueTranslation,
  shouldTranslate,
  TRANSLATION_BATCH_READY_EVENT,
  translateText,
  type LanguageCode
} from "@/lib/i18n";

type LocaleContextValue = {
  locale: LanguageCode;
  setLocale: (nextLocale: LanguageCode) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

type LocaleProviderProps = Readonly<{
  children: ReactNode;
}>;

const ATTRIBUTE_NAMES = ["placeholder", "aria-label", "title"] as const;

export function LocaleProvider({ children }: LocaleProviderProps) {
  // Locale is now URL-driven (next-intl [locale] segment). This provider keeps
  // the same `{ locale, setLocale }` contract for legacy consumers, but the
  // MutationObserver below only runs as a fallback translator for strings that
  // haven't been extracted to next-intl message files yet.
  const locale = useIntlLocale() as LanguageCode;
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const textNodeSources = useRef(
    new WeakMap<Text, { source: string }>()
  );
  const attributeSources = useRef(
    new WeakMap<Element, Map<(typeof ATTRIBUTE_NAMES)[number], string>>()
  );
  const titleSource = useRef<string | null>(null);

  const setLocale = useCallback(
    (nextLocale: LanguageCode) => {
      startTransition(() => {
        router.replace(pathname, { locale: nextLocale });
      });
    },
    [pathname, router]
  );

  const translateTextNode = useCallback(
    (node: Text) => {
      const currentValue = node.nodeValue ?? "";
      const existing = textNodeSources.current.get(node);
      const trimmedCurrentValue = currentValue.trim();

      if (!existing) {
        textNodeSources.current.set(node, { source: currentValue });
      }

      const tracked = textNodeSources.current.get(node);
      const sourceValue = tracked?.source ?? currentValue;
      const translatedSourceValue = translateText(locale, sourceValue.trim());

      if (
        tracked &&
        trimmedCurrentValue &&
        trimmedCurrentValue !== sourceValue.trim() &&
        trimmedCurrentValue !== translatedSourceValue
      ) {
        textNodeSources.current.set(node, { source: currentValue });
      }

      const rawValue = textNodeSources.current.get(node)?.source ?? currentValue;

      const trimmed = rawValue.trim();
      if (!trimmed) {
        return;
      }

      const parentElement = node.parentElement;
      if (
        !parentElement ||
        ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parentElement.tagName) ||
        parentElement.closest("svg") ||
        parentElement.closest("[data-no-translate], [translate='no']")
      ) {
        return;
      }

      const translated = translateText(locale, trimmed);
      const leadingWhitespace = rawValue.match(/^\s*/)?.[0] ?? "";
      const trailingWhitespace = rawValue.match(/\s*$/)?.[0] ?? "";
      const nextValue = translated === trimmed
        ? rawValue
        : `${leadingWhitespace}${translated}${trailingWhitespace}`;
      if (node.nodeValue !== nextValue) {
        node.nodeValue = nextValue;
      }
      if (translated === trimmed && shouldTranslate(trimmed)) {
        queueTranslation(locale, trimmed);
      }
    },
    [locale]
  );

  const translateElementAttributes = useCallback(
    (element: Element) => {
      if (element.closest("[data-no-translate], [translate='no']")) {
        return;
      }
      let sourceMap = attributeSources.current.get(element);
      if (!sourceMap) {
        sourceMap = new Map();
        attributeSources.current.set(element, sourceMap);
      }

      for (const attributeName of ATTRIBUTE_NAMES) {
        const currentValue = element.getAttribute(attributeName);
      if (!sourceMap.has(attributeName) && currentValue) {
        sourceMap.set(attributeName, currentValue);
      } else if (currentValue) {
        const previousValue = sourceMap.get(attributeName);
        const translatedPreviousValue = previousValue
          ? translateText(locale, previousValue)
          : null;

        if (
          previousValue &&
          currentValue !== previousValue &&
          currentValue !== translatedPreviousValue
        ) {
          sourceMap.set(attributeName, currentValue);
        }
      }

        const sourceValue = sourceMap.get(attributeName);
        if (!sourceValue) {
          continue;
        }

        const translated = translateText(locale, sourceValue);
        const nextAttrValue = translated !== sourceValue ? translated : sourceValue;
        if (element.getAttribute(attributeName) !== nextAttrValue) {
          element.setAttribute(attributeName, nextAttrValue);
        }
        if (translated === sourceValue && shouldTranslate(sourceValue)) {
          queueTranslation(locale, sourceValue);
        }
      }
    },
    [locale]
  );

  const translateTree = useCallback(
    (root: ParentNode) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();

      while (current) {
        if (current instanceof Text) {
          translateTextNode(current);
        }
        current = walker.nextNode();
      }

      if (root instanceof Element) {
        translateElementAttributes(root);
      }

      if ("querySelectorAll" in root) {
        root.querySelectorAll("*").forEach((element) => {
          translateElementAttributes(element);
        });
      }
    },
    [translateElementAttributes, translateTextNode]
  );

  useEffect(() => {
    // `<html lang>` and `dir` are now set server-side in `[locale]/layout.tsx`,
    // and locale persistence lives in the URL itself — no localStorage needed.

    // English is the source language. When switching back to English, walk the
    // tree once to restore text/attributes to the stored source values —
    // otherwise content translated into the previous locale would stay on screen.
    // Wrapped in try/catch so a DOM race (React reconciliation vs our writes)
    // never takes down the page.
    if (locale === "en") {
      try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null = walker.nextNode();
        while (node) {
          if (node instanceof Text) {
            const tracked = textNodeSources.current.get(node);
            if (tracked && node.nodeValue !== tracked.source) {
              node.nodeValue = tracked.source;
            }
          }
          node = walker.nextNode();
        }
        document.body.querySelectorAll("*").forEach((el) => {
          if (el.closest("[data-no-translate], [translate='no']")) return;
          const attrMap = attributeSources.current.get(el);
          if (!attrMap) return;
          for (const [attr, src] of attrMap.entries()) {
            if (el.getAttribute(attr) !== src) {
              el.setAttribute(attr, src);
            }
          }
        });
        if (titleSource.current && document.title !== titleSource.current) {
          document.title = titleSource.current;
        }
      } catch {
        // Swallow: a stale DOM reference is not worth crashing the app over.
      }
      return;
    }

    const applyTitleTranslation = () => {
      if (!document.title) {
        return;
      }

      titleSource.current = document.title;
      const translated = translateText(locale, titleSource.current);
      if (document.title !== translated) {
        document.title = translated;
      }
    };

    applyTitleTranslation();

    // Re-entry guard: MutationObserver fires characterData events for every
    // nodeValue write, so without this flag translateTextNode would observe
    // its own writes and loop until the tab hangs.
    let isTranslating = false;
    let disposed = false;
    const runTranslation = (fn: () => void) => {
      if (isTranslating || disposed) return;
      isTranslating = true;
      try {
        fn();
      } catch {
        // DOM race between React reconciliation and our MutationObserver —
        // swallowing keeps the page usable; next batch/event will retry.
      } finally {
        isTranslating = false;
      }
    };

    // Defer the initial pass by a frame so React hydration can finish first.
    // Running synchronously here would race with hydration on slow devices
    // and occasionally blank the page.
    const initialPassHandle = window.requestAnimationFrame(() => {
      runTranslation(() => translateTree(document.body));
    });

    const observer = new MutationObserver((mutations) => {
      if (isTranslating) return;
      runTranslation(() => {
        for (const mutation of mutations) {
          if (mutation.type === "characterData" && mutation.target instanceof Text) {
            translateTextNode(mutation.target);
          }

          mutation.addedNodes.forEach((node) => {
            if (node instanceof Text) {
              translateTextNode(node);
            } else if (node instanceof Element) {
              translateTree(node);
            }
          });
        }
      });
    });

    const titleElement = document.head.querySelector("title");
    const titleObserver = new MutationObserver(() => {
      if (isTranslating) return;
      runTranslation(applyTitleTranslation);
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });

    if (titleElement) {
      titleObserver.observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    const handleBatchReady = (event: Event) => {
      const detail = (event as CustomEvent<{ locale?: LanguageCode }>).detail;
      if (detail?.locale && detail.locale !== locale) return;
      runTranslation(() => {
        applyTitleTranslation();
        translateTree(document.body);
      });
    };

    window.addEventListener(TRANSLATION_BATCH_READY_EVENT, handleBatchReady);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(initialPassHandle);
      observer.disconnect();
      titleObserver.disconnect();
      window.removeEventListener(TRANSLATION_BATCH_READY_EVENT, handleBatchReady);
    };
  }, [locale, translateTextNode, translateTree]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale
    }),
    [locale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useLocale must be used within a LocaleProvider.");
  }

  return context;
}
