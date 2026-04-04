"use client";

import Link from "next/link";

import { getPublicEnv } from "@/lib/config";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/dashboard",
    label: "Overview",
    shortLabel: "Home"
  },
  {
    href: "/dashboard/profile",
    label: "Profile",
    shortLabel: "Profile"
  },
  {
    href: "/dashboard/cases",
    label: "Cases",
    shortLabel: "Cases"
  }
];

if (getPublicEnv().appEnv !== "production") {
  navItems.push({
    href: "/dashboard/admin",
    label: "Internal",
    shortLabel: "Ops"
  });
}

type MobileBottomNavProps = Readonly<{
  pathname: string;
}>;

export function MobileBottomNav({ pathname }: MobileBottomNavProps) {
  const gridColumnsClass = navItems.length === 4 ? "grid-cols-4" : "grid-cols-3";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-white/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className={cn("mx-auto grid w-full max-w-md gap-1 px-2 py-2", gridColumnsClass)}>
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              className={cn(
                "flex min-h-[56px] flex-col items-center justify-center rounded-2xl px-2 py-2 text-center transition-colors",
                active
                  ? "bg-accent text-white shadow-glow"
                  : "text-muted hover:bg-ink/5 hover:text-ink"
              )}
              href={item.href}
              key={item.href}
            >
              <span className="text-xs font-medium uppercase tracking-[0.08em]">
                {item.shortLabel}
              </span>
              <span className={cn("mt-1 text-[10px]", active ? "text-white/75" : "text-muted")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
