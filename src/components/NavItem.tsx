import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

interface Props {
  to: string;
  label: string;
  icon: (active: boolean) => ReactNode;
  accent: string;
  expanded: boolean;
  onNavigate?: () => void;
}

export const NavItem = ({ to, label, icon, accent, expanded, onNavigate }: Props) => (
  <NavLink to={to} onClick={onNavigate} title={label} className="group block">
    {({ isActive }) => (
      <span
        className={`relative flex items-center rounded-lg border px-2 py-2 text-sm transition-all ${
          isActive ? "border-[var(--borderSoft)] bg-[var(--panelAlt3)] text-white" : "border-transparent text-[var(--textMuted)] hover:border-[var(--borderSoft)] hover:bg-[var(--panelAlt)]"
        }`}
        style={{
          boxShadow: isActive ? `inset 2px 0 0 0 ${accent}` : undefined,
        }}
      >
        <span
          className={`inline-grid h-7 w-7 place-items-center transition-all duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${expanded ? "mr-2" : "mx-auto"} ${
            isActive ? "opacity-100" : "opacity-90"
          }`}
          style={{ color: accent }}
        >
          {icon(isActive)}
        </span>
        <span className={`truncate transition-all duration-[180ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] ${expanded ? "translate-x-0 opacity-100" : "w-0 -translate-x-1 opacity-0"}`}>{label}</span>
      </span>
    )}
  </NavLink>
);
