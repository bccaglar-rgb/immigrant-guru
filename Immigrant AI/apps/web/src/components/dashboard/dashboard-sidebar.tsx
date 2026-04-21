"use client";

import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", description: "Dashboard home" },
  { href: "/dashboard/analysis", label: "My Analysis", description: "AI recommendations" },
  { href: "/dashboard/profile", label: "Profile", description: "Immigration profile" },
  { href: "/dashboard/cases", label: "My Cases", description: "Your immigration cases" },
];

type DashboardSidebarProps = Readonly<{
  pathname: string;
  userEmail?: string;
}>;

export function DashboardSidebar({ pathname }: DashboardSidebarProps) {

  return (
    <aside className="border-b border-line px-4 py-4 lg:min-h-screen lg:w-[260px] lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
      <div className="lg:sticky lg:top-6">
        <Link className="flex items-center gap-2 px-2" href="/">
          <Image
            src="/logo.png"
            alt="Immigrant Guru"
            width={320}
            height={112}
            className="h-auto w-[40px] object-contain mix-blend-multiply"
            priority
          />
          <span className="select-none text-[1.05rem] font-black tracking-[-0.045em] text-ink">
            <span>Immigrant</span>
            <span className="text-accent">Guru</span>
          </span>
        </Link>

        <nav className="mt-6 flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && item.href !== "/dashboard/analysis" && pathname.startsWith(`${item.href}/`));

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
                  <p className={cn("text-base font-semibold", active ? "text-white" : "text-ink")}>
                    {item.label}
                  </p>
                  <p className={cn("mt-0.5 text-xs", active ? "text-white/70" : "text-muted")}>
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
