"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Animate } from "@/components/ui/animate";
import { AppShell } from "@/components/layout/app-shell";

type AuthShellProps = Readonly<{
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}>;

export function AuthShell({
  children,
  description,
  eyebrow,
  title
}: AuthShellProps) {
  return (
    <AppShell>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />

        <div className="relative mx-auto flex min-h-[calc(100vh-10rem)] max-w-content items-center px-6 py-12 md:px-10">
          <div className="grid w-full gap-12 lg:grid-cols-2 lg:items-center">
            <Animate animation="slide-left" duration={800}>
              <div className="max-w-lg space-y-5">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
                  {eyebrow}
                </p>
                <h1 className="text-4xl font-bold tracking-tight text-ink md:text-5xl">
                  {title}
                </h1>
                <p className="text-lg leading-relaxed text-muted">{description}</p>
                <div className="flex gap-5 text-sm text-muted">
                  <Link className="hover:text-ink transition-colors" href="/">
                    Back to home
                  </Link>
                  <Link className="hover:text-ink transition-colors" href="/dashboard">
                    Dashboard
                  </Link>
                </div>
              </div>
            </Animate>

            <Animate animation="slide-right" delay={200} duration={800}>
              <div className="glass-card rounded-3xl p-8 md:p-10">{children}</div>
            </Animate>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
