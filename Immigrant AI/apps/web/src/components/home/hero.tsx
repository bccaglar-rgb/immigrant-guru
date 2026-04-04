"use client";

import Link from "next/link";

import { Animate, Stagger } from "@/components/ui/animate";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicEnv } from "@/types/env";

const highlights = [
  {
    title: "Profile-Aware",
    description: "Recommendations built from your personal, professional, and financial inputs."
  },
  {
    title: "Case-Centered",
    description: "Every route, document, and score stays tied to your real immigration case."
  },
  {
    title: "Action-Oriented",
    description: "Move from uncertainty to a practical next step, not a vague answer."
  }
];

type HeroProps = Readonly<{
  config: PublicEnv;
}>;

export function Hero({ config }: HeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />

      <div className="relative mx-auto max-w-content px-6 pb-20 pt-24 md:px-10 md:pt-32 md:pb-28">
        <div className="mx-auto max-w-4xl text-center">
          <Animate animation="fade-in" duration={500}>
            <div className="inline-flex items-center rounded-full border border-accent/15 bg-accent/5 px-4 py-1.5 text-sm font-medium text-accent">
              AI-Powered Immigration Platform
            </div>
          </Animate>

          <Animate animation="fade-up" delay={150} duration={800}>
            <h1 className="mt-6 text-5xl font-semibold tracking-tight text-ink md:text-7xl lg:text-8xl">
              Navigate immigration
              <br />
              <span className="text-gradient">with clarity.</span>
            </h1>
          </Animate>

          <Animate animation="fade-up" delay={350} duration={800}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted md:text-xl">
              Compare visa pathways, build your immigration profile, organize case
              strategy, and move from raw uncertainty to a concrete plan.
            </p>
          </Animate>

          <Animate animation="fade-up" delay={500} duration={700}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                className={cn(buttonVariants({ size: "lg", variant: "primary" }), "px-8 anim-pulse-glow")}
                href="/sign-up"
              >
                Get started free
              </Link>
              <Link
                className={cn(buttonVariants({ size: "lg", variant: "secondary" }))}
                href="/sign-in"
              >
                Sign in
              </Link>
            </div>
          </Animate>
        </div>

        <Stagger
          className="mt-20 grid gap-4 md:grid-cols-3"
          animation="fade-up"
          staggerDelay={120}
          duration={600}
        >
          {highlights.map((item) => (
            <div
              className="glass-card rounded-2xl p-6 transition-all duration-300 hover:shadow-soft hover:-translate-y-1"
              key={item.title}
            >
              <p className="text-sm font-semibold text-accent">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {item.description}
              </p>
            </div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
