import { create } from "zustand";

type SidebarMode = "auto" | "manual";

interface SidebarState {
  mode: SidebarMode;
  collapsed: boolean;
  pinned: boolean;
  hovered: boolean;
  expanded: boolean;
  setHovered: (hovered: boolean) => void;
  toggleMode: () => void;
  toggleArrow: () => void;
  clearPinned: () => void;
}

const MODE_KEY = "sidebar_mode";
const COLLAPSED_KEY = "sidebar_collapsed";

const readMode = (): SidebarMode => {
  try {
    const raw = window.localStorage.getItem(MODE_KEY);
    if (raw === "auto" || raw === "manual") return raw;
  } catch {
    // noop
  }
  return "auto";
};

const readCollapsed = (): boolean => {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    // noop
  }
  return true;
};

const persist = (mode: SidebarMode, collapsed: boolean) => {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  } catch {
    // noop
  }
};

const computeExpanded = (mode: SidebarMode, collapsed: boolean, pinned: boolean, hovered: boolean) =>
  mode === "auto" ? pinned || hovered : !collapsed;

export const useSidebarStore = create<SidebarState>((set) => {
  const mode = readMode();
  const collapsed = readCollapsed();
  const pinned = false;
  const hovered = false;

  return {
    mode,
    collapsed,
    pinned,
    hovered,
    expanded: computeExpanded(mode, collapsed, pinned, hovered),
    setHovered: (hovered) =>
      set((state) => {
        if (state.mode !== "auto" || state.pinned) return state;
        return {
          ...state,
          hovered,
          expanded: computeExpanded(state.mode, state.collapsed, state.pinned, hovered),
        };
      }),
    toggleMode: () =>
      set((state) => {
        const nextMode: SidebarMode = state.mode === "auto" ? "manual" : "auto";
        const nextCollapsed =
          nextMode === "auto"
            ? true
            : state.pinned || state.hovered
              ? false
              : state.collapsed;
        const nextPinned = false;
        const nextHovered = false;
        persist(nextMode, nextCollapsed);
        return {
          ...state,
          mode: nextMode,
          collapsed: nextCollapsed,
          pinned: nextPinned,
          hovered: nextHovered,
          expanded: computeExpanded(nextMode, nextCollapsed, nextPinned, nextHovered),
        };
      }),
    toggleArrow: () =>
      set((state) => {
        if (state.mode === "auto") {
          const nextPinned = !state.pinned;
          const nextExpanded = computeExpanded(state.mode, state.collapsed, nextPinned, state.hovered);
          return {
            ...state,
            pinned: nextPinned,
            expanded: nextExpanded,
          };
        }
        const nextCollapsed = !state.collapsed;
        persist(state.mode, nextCollapsed);
        return {
          ...state,
          collapsed: nextCollapsed,
          expanded: computeExpanded(state.mode, nextCollapsed, state.pinned, state.hovered),
        };
      }),
    clearPinned: () =>
      set((state) => {
        if (!state.pinned) return state;
        return {
          ...state,
          pinned: false,
          expanded: computeExpanded(state.mode, state.collapsed, false, state.hovered),
        };
      }),
  };
});

export type { SidebarMode };
