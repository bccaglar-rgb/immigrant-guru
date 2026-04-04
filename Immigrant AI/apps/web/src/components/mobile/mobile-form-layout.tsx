"use client";

import type { ReactNode } from "react";

type MobileFormLayoutProps = Readonly<{
  children: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
}>;

export function MobileFormLayout({
  children,
  footer,
  header
}: MobileFormLayoutProps) {
  return (
    <div className="space-y-4">
      {header ? header : null}
      <div className="space-y-4">{children}</div>
      {footer ? (
        <div
          className="sticky bottom-20 z-20 rounded-[28px] border border-line/80 bg-white/96 p-3 shadow-soft backdrop-blur-xl"
          style={{ bottom: `calc(5rem + env(safe-area-inset-bottom))` }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
