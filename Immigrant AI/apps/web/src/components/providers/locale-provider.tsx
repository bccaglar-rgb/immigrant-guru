"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactNode } from "react";

import {
  getDocumentDirection,
  getInitialLanguage,
  queueTranslation,
  shouldTranslate,
  STORAGE_KEY,
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
  const [locale, setLocaleState] = useState<LanguageCode>(() => getInitialLanguage());
  const textNodeSources = useRef(
    new WeakMap<Text, { source: string }>()
  );
  const attributeSources = useRef(
    new WeakMap<Element, Map<(typeof ATTRIBUTE_NAMES)[number], string>>()
  );
  const titleSource = useRef<string | null>(null);

  const setLocale = useCallback((nextLocale: LanguageCode) => {
    setLocaleState(nextLocale);
  }, []);

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
        parentElement.closest("svg")
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
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = getDocumentDirection(locale);

    // English is the source language — no translation needed,
    // so skip the DOM observer entirely to avoid any loop risk.
    if (locale === "en") {
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
    const runTranslation = (fn: () => void) => {
      if (isTranslating) return;
      isTranslating = true;
      try {
        fn();
      } finally {
        isTranslating = false;
      }
    };

    runTranslation(() => translateTree(document.body));

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
