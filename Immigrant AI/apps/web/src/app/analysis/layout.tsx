import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

type AnalysisLayoutProps = Readonly<{ children: ReactNode }>;

export default function AnalysisLayout({ children }: AnalysisLayoutProps) {
  return (
    <div className="relative min-h-screen bg-canvas">
      <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" className="flex items-center">
          <Image src="/logo.png" alt="Immigrant Guru" width={400} height={400} className="h-auto w-[80px] object-contain" priority />
        </Link>
        <Link href="/dashboard" className="text-sm font-medium text-muted transition-colors hover:text-ink">
          Skip to dashboard
        </Link>
      </header>

      <main className="relative z-10">{children}</main>
    </div>
  );
}
