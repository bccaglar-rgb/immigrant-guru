import type { ReactNode } from "react";

import Image from "next/image";
import Link from "next/link";

import { LanguageSwitcher } from "@/components/layout/language-switcher";

type OnboardingLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return (
    <div className="relative min-h-screen bg-canvas">
      <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo-mark.svg"
            alt="Immigrant Guru"
            width={36}
            height={36}
            className="h-9 w-9 object-contain"
          />
          <span className="text-xl font-semibold tracking-tight text-ink">
            Immigrant Guru
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            href="/dashboard"
            className="text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            Skip to dashboard
          </Link>
        </div>
      </header>

      <main className="relative z-10">{children}</main>
    </div>
  );
}
