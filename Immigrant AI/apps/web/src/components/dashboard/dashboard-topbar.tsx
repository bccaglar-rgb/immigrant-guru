"use client";

import Link from "next/link";

import { Animate } from "@/components/ui/animate";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AuthenticatedUser, AuthSession } from "@/types/auth";

type DashboardTopbarProps = Readonly<{
  clearSession: () => void;
  pathname: string;
  session: AuthSession;
  user: AuthenticatedUser;
}>;

function getPageTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Overview";
  if (pathname === "/dashboard/profile") return "Profile";
  if (pathname === "/dashboard/cases") return "Cases";
  if (pathname === "/dashboard/admin") return "Internal Console";
  if (pathname.startsWith("/dashboard/cases/")) return "Case Detail";
  return "Dashboard";
}

function getDisplayName(user: AuthenticatedUser): string {
  return user.profile?.first_name || user.email.split("@")[0] || "Member";
}

export function DashboardTopbar({
  clearSession,
  pathname,
  session,
  user
}: DashboardTopbarProps) {
  const tokenMinutes = Math.max(Math.floor(session.expiresIn / 60), 1);
  const title = getPageTitle(pathname);

  return (
    <Animate animation="fade-up" duration={600}>
      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">
              {title}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">
              Welcome back, {getDisplayName(user)}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Continue your immigration planning. Keep profile and case data aligned.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-line bg-canvas/60 px-4 py-2.5 text-right">
              <p className="text-xs text-muted">{user.email}</p>
              <p className="mt-0.5 text-xs text-muted/60">
                Session: {tokenMinutes}m
              </p>
            </div>
            <Link
              className={cn(buttonVariants({ size: "md", variant: "secondary" }))}
              href="/"
            >
              Home
            </Link>
            <button
              className={cn(buttonVariants({ size: "md", variant: "primary" }))}
              onClick={clearSession}
              type="button"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </Animate>
  );
}
