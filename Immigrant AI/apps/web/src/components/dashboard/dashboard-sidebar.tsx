"use client";

import Link from "next/link";

import { getPublicEnv } from "@/lib/config";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/dashboard",
    label: "Overview",
    description: "Platform summary"
  },
  {
    href: "/dashboard/profile",
    label: "Profile",
    description: "Immigration profile"
  },
  {
    href: "/dashboard/cases",
    label: "Cases",
    description: "Migration goals"
  }
];

if (getPublicEnv().appEnv !== "production") {
  navItems.push({
    href: "/dashboard/admin",
    label: "Internal",
    description: "Ops and knowledge tools"
  });
}

type DashboardSidebarProps = Readonly<{
  pathname: string;
}>;

export function DashboardSidebar({ pathname }: DashboardSidebarProps) {
  return (
    <aside className="border-b border-line px-4 py-4 lg:min-h-screen lg:w-[260px] lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
      <div className="lg:sticky lg:top-6">
        <Link className="flex items-center gap-2.5 px-2" href="/">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-accent text-sm font-bold text-white">
            iG
          </div>
          <span className="text-lg font-semibold tracking-tight text-ink">
            Immigrant Guru
          </span>
        </Link>

        <nav className="mt-6 flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

            return (
              <Link href={item.href} key={item.href}>
                <div
                  className={cn(
                    "rounded-xl px-4 py-3 transition-all duration-200",
                    active
                      ? "bg-accent text-white shadow-glow"
                      : "text-ink hover:bg-ink/5"
                  )}
                >
                  <p className={cn(
                    "text-base font-semibold",
                    active ? "text-white" : "text-ink"
                  )}>
                    {item.label}
                  </p>
                  <p className={cn(
                    "mt-0.5 text-xs",
                    active ? "text-white/70" : "text-muted"
                  )}>
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
