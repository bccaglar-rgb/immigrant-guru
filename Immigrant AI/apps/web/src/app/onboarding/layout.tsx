import type { ReactNode } from "react";

import Link from "next/link";

type OnboardingLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return (
    <div className="relative min-h-screen bg-canvas">
      <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-accent text-sm font-bold text-white">
            iG
          </div>
          <span className="text-xl font-semibold tracking-tight text-ink">
            Immigrant Guru
          </span>
        </Link>

        <Link
          href="/dashboard"
          className="text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          Skip to dashboard
        </Link>
      </header>

      <main className="relative z-10">{children}</main>
    </div>
  );
}
