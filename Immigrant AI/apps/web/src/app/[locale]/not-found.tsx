"use client";

import Link from "next/link";

import { Animate } from "@/components/ui/animate";
import { AppShell } from "@/components/layout/app-shell";

export default function NotFound() {
  return (
    <AppShell>
      <section className="flex flex-1 items-center justify-center py-24">
        <div className="text-center">
          <Animate animation="scale-in" duration={800}>
            <p className="text-9xl font-bold tracking-tight text-gradient">404</p>
          </Animate>
          <Animate animation="fade-up" delay={300} duration={600}>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
              Page not found
            </h1>
          </Animate>
          <Animate animation="fade-up" delay={450} duration={600}>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              The page you&apos;re looking for doesn&apos;t exist or hasn&apos;t been built yet.
            </p>
          </Animate>
          <Animate animation="fade-up" delay={600} duration={600}>
            <Link
              className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-white transition-all hover:bg-accent-hover active:scale-[0.98]"
              href="/"
            >
              Return home
            </Link>
          </Animate>
        </div>
      </section>
    </AppShell>
  );
}
