"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AuthenticatedUser } from "@/types/auth";

type MobileNavbarProps = Readonly<{
  clearSession: () => void;
  title: string;
  user: AuthenticatedUser;
}>;

function getDisplayName(user: AuthenticatedUser, fallback: string): string {
  return user.profile?.first_name || user.email.split("@")[0] || fallback;
}

export function MobileNavbar({
  clearSession,
  title,
  user
}: MobileNavbarProps) {
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-white/90 backdrop-blur-xl">
      <div
        className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-3 pt-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex shrink-0 items-center gap-2">
            <Image
              src="/logo.png"
              alt={t("Immigrant Guru")}
              width={320}
              height={112}
              className="h-auto w-[40px] object-contain mix-blend-multiply"
              priority
            />
            <span className="select-none text-[1rem] font-black tracking-[-0.045em] text-ink">
              <span>Immigrant</span>
              <span className="text-accent">Guru</span>
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-ink">
              {title}
            </h1>
            <p className="mt-1 truncate text-xs text-muted">
              {getDisplayName(user, t("Member"))} · {user.email}
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
            {t("Home")}
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
            {t("Log out")}
          </button>
        </div>
      </div>
    </header>
  );
}
