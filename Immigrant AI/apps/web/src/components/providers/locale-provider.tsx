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
  STORAGE_KEY,
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
  const [locale, setLocaleState] = useState<LanguageCode>("en");
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
      if (translated === trimmed) {
        node.nodeValue = rawValue;
        return;
      }

      const leadingWhitespace = rawValue.match(/^\s*/)?.[0] ?? "";
      const trailingWhitespace = rawValue.match(/\s*$/)?.[0] ?? "";
      node.nodeValue = `${leadingWhitespace}${translated}${trailingWhitespace}`;
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
        if (translated !== sourceValue) {
          element.setAttribute(attributeName, translated);
        } else {
          element.setAttribute(attributeName, sourceValue);
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
    const nextLanguage = getInitialLanguage();
    setLocaleState(nextLanguage);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = getDocumentDirection(locale);

    const applyTitleTranslation = () => {
      if (!document.title) {
        return;
      }

      titleSource.current = document.title;
      document.title = translateText(locale, titleSource.current);
    };

    applyTitleTranslation();

    translateTree(document.body);

    const observer = new MutationObserver((mutations) => {
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

    const titleElement = document.head.querySelector("title");
    const titleObserver = new MutationObserver(() => {
      applyTitleTranslation();
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

    return () => {
      observer.disconnect();
      titleObserver.disconnect();
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
