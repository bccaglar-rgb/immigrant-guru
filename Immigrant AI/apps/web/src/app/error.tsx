"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Animate } from "@/components/ui/animate";
import { AppShell } from "@/components/layout/app-shell";

type ErrorPageProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AppShell>
      <section className="flex flex-1 items-center justify-center py-24">
        <div className="text-center">
          <Animate animation="scale-in" duration={600}>
            <p className="text-sm font-semibold uppercase tracking-wider text-red">
              Error
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
              Something went wrong
            </h1>
          </Animate>
          <Animate animation="fade-up" delay={200} duration={600}>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
              The page hit an unexpected error while rendering. Try again, and if
              it persists, check the server logs.
            </p>
          </Animate>
          <Animate animation="fade-up" delay={400} duration={600}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-white transition-all hover:bg-accent-hover active:scale-[0.98]"
                onClick={reset}
                type="button"
              >
                Retry
              </button>
              <Link
                className="inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold text-accent ring-1 ring-inset ring-accent/30 transition-all hover:bg-accent/5"
                href="/"
              >
                Go home
              </Link>
            </div>
          </Animate>
        </div>
      </section>
    </AppShell>
  );
}
