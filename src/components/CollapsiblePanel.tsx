import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  open: boolean;
  onToggle: () => void;
  status?: string;
  children: ReactNode;
}

export const CollapsiblePanel = ({ title, description, open, onToggle, status, children }: Props) => (
  <section className="rounded-2xl border border-white/10 bg-[#121316]">
    <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        {description ? <p className="text-xs text-[#6B6F76]">{description}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {status ? <span className="rounded-full border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[10px] text-[#BFC2C7]">{status}</span> : null}
        <span className={`text-xs text-[#BFC2C7] transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </div>
    </button>
    <div className={`grid overflow-hidden border-t border-white/10 transition-[grid-template-rows] duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
      <div className="min-h-0">
        <div className="p-4">{children}</div>
      </div>
    </div>
  </section>
);
