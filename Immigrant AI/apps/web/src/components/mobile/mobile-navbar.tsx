"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AuthenticatedUser } from "@/types/auth";

type MobileNavbarProps = Readonly<{
  clearSession: () => void;
  title: string;
  user: AuthenticatedUser;
}>;

function getDisplayName(user: AuthenticatedUser): string {
  return user.profile?.first_name || user.email.split("@")[0] || "Member";
}

export function MobileNavbar({
  clearSession,
  title,
  user
}: MobileNavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-white/90 backdrop-blur-xl">
      <div
        className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 pb-3 pt-4"
        style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            Immigrant Guru
          </p>
          <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-1 truncate text-xs text-muted">
            {getDisplayName(user)} · {user.email}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            className={cn(
              buttonVariants({
                className: "h-10 px-4 text-xs font-semibold",
                size: "md",
                variant: "secondary"
              })
            )}
            href="/"
          >
            Home
          </Link>
          <button
            className={cn(
              buttonVariants({
                className: "h-10 px-4 text-xs font-semibold",
                size: "md",
                variant: "primary"
              })
            )}
            onClick={clearSession}
            type="button"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
