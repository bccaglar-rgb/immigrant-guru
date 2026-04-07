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
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="Immigrant Guru"
            width={320}
            height={112}
            className="h-auto w-[100px] object-contain md:w-[118px]"
            priority
          />
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
