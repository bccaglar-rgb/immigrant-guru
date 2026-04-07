"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useAuthSession } from "@/hooks/use-auth-session";
import { HeaderAuthActions } from "@/components/layout/header-auth-actions";

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { status } = useAuthSession();
  const isLoggedIn = status === "authenticated";

  const navItems = [
    { href: "/#how", label: "How it works" },
    { href: isLoggedIn ? "/analysis" : "/sign-up", label: "Find your path" },
    { href: "/pricing", label: "Pricing" },
  ];

  return (
    <header className="sticky top-0 z-30 glass border-b border-line">
      <div className="mx-auto flex max-w-content items-center justify-between gap-6 px-6 py-3.5 md:px-10">
        <Link className="flex items-center" href="/">
          <Image
            src="/logo.png"
            alt="Immigrant Guru"
            width={320}
            height={112}
            className="h-auto w-[168px] object-contain md:w-[196px]"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {navItems.map((item) => (
            <Link
              className="text-sm font-medium text-muted transition-colors hover:text-ink"
              href={item.href}
              key={item.label}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <HeaderAuthActions />
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-ink/5 lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            type="button"
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              {mobileOpen ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-line bg-white/95 px-6 py-4 lg:hidden">
          <nav className="flex flex-col gap-3">
            {navItems.map((item) => (
              <Link
                className="text-base font-medium text-ink transition-colors hover:text-accent"
                href={item.href}
                key={item.label}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
