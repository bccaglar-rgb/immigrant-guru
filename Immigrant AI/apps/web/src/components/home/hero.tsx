"use client";

import Link from "next/link";
import { Animate } from "@/components/ui/animate";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicEnv } from "@/types/env";

type HeroProps = Readonly<{ config: PublicEnv }>;

export function Hero({ config }: HeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />

      <div className="relative mx-auto max-w-content px-6 pb-16 pt-20 md:px-10 md:pt-28 md:pb-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
          {/* Left: Copy */}
          <div>
            <Animate animation="fade-up" duration={600}>
              <p className="text-sm font-medium text-accent">
                Built for immigrants, by immigrants
              </p>
            </Animate>

            <Animate animation="fade-up" delay={100} duration={700}>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink md:text-5xl lg:text-6xl">
                Move to a new country
                <br />
                <span className="text-gradient">without confusion.</span>
              </h1>
            </Animate>

            <Animate animation="fade-up" delay={250} duration={700}>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
                Get your personalized visa, readiness score, and action plan in minutes. Not months.
              </p>
            </Animate>

            <Animate animation="fade-up" delay={400} duration={600}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  className={cn(buttonVariants({ size: "lg", variant: "primary" }), "px-8 shadow-glow")}
                  href="/sign-up"
                >
                  Start your plan
                </Link>
                <Link
                  className={cn(buttonVariants({ size: "lg", variant: "ghost" }))}
                  href="/#how"
                >
                  See how it works
                </Link>
              </div>
            </Animate>
          </div>

          {/* Right: Mockup card */}
          <Animate animation="slide-right" delay={300} duration={800}>
            <div className="glass-card rounded-3xl p-6 md:p-8 shadow-soft">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                Your best path
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">
                EB-2 NIW
              </h3>
              <p className="mt-1 text-sm text-muted">National Interest Waiver &middot; United States</p>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas/50 px-4 py-3">
                  <span className="text-sm text-muted">Suitability</span>
                  <span className="text-base font-semibold text-accent">85%</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas/50 px-4 py-3">
                  <span className="text-sm text-muted">Timeline</span>
                  <span className="text-base font-semibold text-ink">12-18 months</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas/50 px-4 py-3">
                  <span className="text-sm text-muted">Est. cost</span>
                  <span className="text-base font-semibold text-ink">$4,500</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas/50 px-4 py-3">
                  <span className="text-sm text-muted">Readiness</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink/8">
                      <div className="h-full w-3/4 rounded-full bg-accent" />
                    </div>
                    <span className="text-sm font-semibold text-ink">76/100</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-green/8 px-4 py-2.5">
                <p className="text-sm font-medium text-green">
                  No employer sponsor needed &mdash; you can self-petition.
                </p>
              </div>
            </div>
          </Animate>
        </div>
      </div>
    </section>
  );
}
