"use client";

import type { ReactNode } from "react";

import { Animate } from "@/components/ui/animate";
import { cn } from "@/lib/utils";

type SectionContainerProps = Readonly<{
  children: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  title?: string;
}>;

export function SectionContainer({
  children,
  className,
  description,
  eyebrow,
  title
}: SectionContainerProps) {
  return (
    <section className={cn("py-16 md:py-24", className)}>
      <div className="mx-auto max-w-content px-6 md:px-10">
        {eyebrow || title || description ? (
          <Animate animation="fade-up" duration={700}>
            <div className="mb-12 max-w-3xl space-y-4 text-center mx-auto">
              {eyebrow ? (
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
                  {eyebrow}
                </p>
              ) : null}
              {title ? (
                <h2 className="text-4xl font-bold tracking-tight text-ink md:text-5xl">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="text-lg leading-relaxed text-muted">
                  {description}
                </p>
              ) : null}
            </div>
          </Animate>
        ) : null}
        {children}
      </div>
    </section>
  );
}
