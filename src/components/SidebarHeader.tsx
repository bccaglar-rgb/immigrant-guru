import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { IconFullscreenEnter, IconFullscreenExit } from "../icons/bitrium";

interface Props {
  logoUrl?: string;
  collapsed: boolean;
  mobile?: boolean;
  mode: "auto" | "manual";
  onModeToggle?: () => void;
  onLogoNavigate?: () => void;
}

const EXPANDED_LOGO_SCALE = 1.39 * 0.83 * 0.85;
const COLLAPSED_LOGO_SCALE = 1.06 * 0.83 * 1.4 * 0.88;

export const SidebarHeader = ({
  logoUrl,
  collapsed,
  mobile = false,
  mode,
  onModeToggle,
  onLogoNavigate,
}: Props) => {
  const [logoBroken, setLogoBroken] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== "undefined" ? Boolean(document.fullscreenElement) : false,
  );

  useEffect(() => {
    setLogoBroken(false);
  }, [logoUrl]);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const showImage = Boolean(logoUrl) && !logoBroken;
  const logoScale = collapsed ? COLLAPSED_LOGO_SCALE : EXPANDED_LOGO_SCALE;
  const fallbackText = useMemo(() => (collapsed ? "B" : "BITRIUM"), [collapsed]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Noop: some browser contexts may block fullscreen without user gesture.
    }
  };

  return (
    <div className="mb-3">
      <NavLink to="/" onClick={onLogoNavigate} title="Bitrium" className="block">
        <div className={`w-full ${collapsed ? "mx-auto h-[68px] w-[68px]" : "h-28"}`}>
          {showImage ? (
            <img
              src={logoUrl}
              alt="Brand logo"
              onError={() => setLogoBroken(true)}
              className="mx-auto h-full w-full object-contain object-center"
              style={{ transform: `scale(${logoScale})` }}
            />
          ) : (
            <div
              className={`mx-auto grid h-full w-full place-items-center rounded-2xl border border-[var(--borderSoft)] bg-[var(--panelAlt)] text-[var(--text)] ${
                collapsed ? "text-2xl font-bold" : "text-xl font-semibold tracking-[0.2em]"
              }`}
              title="Bitrium logo fallback"
            >
              {fallbackText}
            </div>
          )}
        </div>
      </NavLink>

      {!mobile ? (
        collapsed ? (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--borderSoft)] bg-[var(--panelAlt)] text-[var(--textMuted)] transition duration-200 hover:border-[var(--accent)] hover:text-[var(--text)]"
              title={isFullscreen ? "Exit fullpage" : "Enter fullpage"}
              aria-label={isFullscreen ? "Exit fullpage" : "Enter fullpage"}
            >
              {isFullscreen ? (
                <IconFullscreenExit active size={20} className="h-4 w-4" />
              ) : (
                <IconFullscreenEnter size={20} className="h-4 w-4" />
              )}
            </button>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onModeToggle}
              className="rounded-[10px] border border-[var(--borderSoft)] bg-[var(--panelAlt)] px-2 py-1.5 text-left text-xs transition duration-200 hover:shadow-[0_0_0_1px_var(--borderSoft),0_0_12px_rgba(245,197,66,0.18)]"
              title="Auto sidebar mode"
            >
              <span className="inline-flex w-full items-center justify-between gap-2">
                <span
                  className={`relative inline-flex h-5 w-9 rounded-full border transition ${
                    mode === "auto"
                      ? "border-[var(--accent)] bg-[color:rgba(245,197,66,0.22)]"
                      : "border-[var(--borderSoft)] bg-[var(--panel)]"
                  }`}
                >
                  <span
                    className={`absolute top-[1px] h-3.5 w-3.5 rounded-full bg-[var(--text)] transition-transform duration-200 ${
                      mode === "auto" ? "translate-x-[18px]" : "translate-x-[2px]"
                    }`}
                  />
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center justify-center rounded-[10px] border border-[var(--borderSoft)] bg-[var(--panelAlt)] px-2 py-1.5 text-[var(--textMuted)] transition duration-200 hover:border-[var(--accent)] hover:text-[var(--text)]"
              title={isFullscreen ? "Exit fullpage" : "Enter fullpage"}
              aria-label={isFullscreen ? "Exit fullpage" : "Enter fullpage"}
            >
              {isFullscreen ? (
                <IconFullscreenExit active size={20} className="h-4 w-4" />
              ) : (
                <IconFullscreenEnter size={20} className="h-4 w-4" />
              )}
            </button>
          </div>
        )
      ) : null}
    </div>
  );
};
