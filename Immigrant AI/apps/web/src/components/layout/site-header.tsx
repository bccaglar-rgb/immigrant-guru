import Link from "next/link";

import { HeaderAuthActions } from "@/components/layout/header-auth-actions";

const navItems = [
  { href: "/#benefits", label: "Benefits" },
  { href: "/#score", label: "Score" },
  { href: "/#plans", label: "Strategy" }
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 glass border-b border-line">
      <div className="mx-auto flex max-w-content items-center justify-between gap-6 px-6 py-3.5 md:px-10">
        <Link className="flex items-center gap-2.5" href="/">
          <img src="/logo.png" alt="Immigrant Guru" className="h-9 w-9 object-contain" />
          <span className="text-xl font-semibold tracking-tight text-ink">
            Immigrant Guru
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {navItems.map((item) => (
            <Link
              className="text-sm font-medium text-muted transition-colors hover:text-ink"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <HeaderAuthActions />
      </div>
    </header>
  );
}
