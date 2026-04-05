import Image from "next/image";
import Link from "next/link";

import { HeaderAuthActions } from "@/components/layout/header-auth-actions";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

const navItems = [
  { href: "/#benefits", label: "Benefits" },
  { href: "/#score", label: "Score" },
  { href: "/#plans", label: "Strategy" }
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 glass border-b border-line">
      <div className="mx-auto flex max-w-content items-center justify-between gap-6 px-6 py-3.5 md:px-10">
        <Link className="flex items-center" href="/">
          <Image
            src="/logo.png"
            alt="Immigrant Guru"
            width={320}
            height={112}
            className="h-auto w-[90px] object-contain md:w-[100px]"
            priority
          />
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

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <HeaderAuthActions />
        </div>
      </div>
    </header>
  );
}
