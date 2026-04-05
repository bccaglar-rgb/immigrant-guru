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
          <div className="relative overflow-hidden rounded-3xl bg-gradient-dark px-8 py-16 text-center md:px-16 md:py-20">
            <div className="absolute inset-0 bg-gradient-mesh opacity-20 pointer-events-none" />

            <div className="relative">
              <Animate animation="fade-up" delay={200} duration={700}>
                <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
                  Your new life starts here.
                </h2>
              </Animate>

              <Animate animation="fade-up" delay={350} duration={700}>
                <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-white/50">
                  Stop guessing. Get a clear plan for your immigration journey — in minutes, not months.
                </p>
              </Animate>

              <Animate animation="fade-up" delay={500} duration={600}>
                <div className="mt-8">
                  <Link
                    className={cn(
                      buttonVariants({ size: "lg", variant: "primary" }),
                      "px-10 shadow-glow text-base"
                    )}
                    href="/sign-up"
                  >
                    Start your plan
                  </Link>
                </div>
              </Animate>

              <Animate animation="fade-in" delay={650} duration={500}>
                <p className="mt-5 text-sm text-white/30">
                  Free to start &middot; No credit card &middot; Takes 2 minutes
                </p>
              </Animate>
            </div>
          </div>
        </Animate>
      </div>
    </section>
  );
}
