"use client";

import Link from "next/link";

import { Animate } from "@/components/ui/animate";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CallToAction() {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <Animate animation="scale-in" duration={900}>
          <div className="relative overflow-hidden rounded-4xl bg-gradient-dark px-8 py-16 text-center md:px-16 md:py-24">
            <div className="absolute inset-0 bg-gradient-mesh opacity-30 pointer-events-none" />

            <div className="relative">
              <Animate animation="fade-in" delay={200} duration={600}>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
                  Get Started
                </p>
              </Animate>
              <Animate animation="fade-up" delay={350} duration={800}>
                <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-bold tracking-tight text-white md:text-5xl">
                  Build your immigration profile and start comparing pathways.
                </h2>
              </Animate>
              <Animate animation="fade-up" delay={500} duration={800}>
                <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/60">
                  Create an account to collect decision-ready inputs, track cases,
                  generate strategy options, and keep documents organized in one workspace.
                </p>
              </Animate>
              <Animate animation="fade-up" delay={650} duration={700}>
                <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                  <Link
                    className={cn(
                      buttonVariants({ size: "lg", variant: "primary" }),
                      "px-8 shadow-glow"
                    )}
                    href="/sign-up"
                  >
                    Create free account
                  </Link>
                  <Link
                    className="inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold text-white/80 ring-1 ring-inset ring-white/20 transition-all hover:bg-white/5 hover:text-white"
                    href="/sign-in"
                  >
                    Sign in
                  </Link>
                </div>
              </Animate>
            </div>
          </div>
        </Animate>
      </div>
    </section>
  );
}
