import { useEffect, useRef, useState } from "react";

interface Options {
  expandDelayMs?: number;
  collapseDelayMs?: number;
}

const STORAGE_KEY = "sidebar-display-mode-v1";
type SidebarMode = "expanded" | "collapsed" | "auto";

export const useSidebarHover = (options?: Options) => {
  const { expandDelayMs = 80, collapseDelayMs = 140 } = options ?? {};
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [mode, setMode] = useState<SidebarMode>(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "expanded" || raw === "collapsed" || raw === "auto") return raw;
    } catch {
      // noop
    }
    return "auto";
  });
  const timerRef = useRef<number | null>(null);
  const expanded = mode === "expanded" ? true : mode === "collapsed" ? false : hoverExpanded;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onMouseEnter = () => {
    if (mode !== "auto") return;
    clearTimer();
    timerRef.current = window.setTimeout(() => setHoverExpanded(true), expandDelayMs);
  };

  const onMouseLeave = () => {
    if (mode !== "auto") return;
    clearTimer();
    timerRef.current = window.setTimeout(() => setHoverExpanded(false), collapseDelayMs);
  };

  const toggleMode = () => {
    setMode((prev) => {
      if (prev === "expanded") return "collapsed";
      return "expanded";
    });
  };

  const setAutoMode = () => setMode("auto");

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // noop
    }
  }, [mode]);

  useEffect(() => () => clearTimer(), [mode]);

  return { expanded, mode, onMouseEnter, onMouseLeave, toggleMode, setAutoMode };
};
