"use client";

import Image from "next/image";
import Link from "next/link";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
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
        className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-3 pt-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <Image
            src="/logo.png"
            alt="Immigrant Guru"
            width={320}
            height={112}
            className="mt-0.5 h-auto w-[90px] shrink-0 object-contain"
            priority
          />
          <div className="min-w-0">
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-ink">
              {title}
            </h1>
            <p className="mt-1 truncate text-xs text-muted">
              {getDisplayName(user)} · {user.email}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <LanguageSwitcher compact />
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
