"use client";

import { Animate } from "@/components/ui/animate";

type WelcomeStepProps = {
  firstName: string;
  onNext: () => void;
};

export function WelcomeStep({ firstName, onNext }: WelcomeStepProps) {
  const displayName = firstName || "there";

  return (
    <div className="flex flex-col items-center justify-center text-center py-12 md:py-20">
      <Animate animation="scale-in" duration={800}>
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-accent text-3xl font-bold text-white anim-pulse-glow">
          iG
        </div>
      </Animate>

      <Animate animation="fade-up" delay={300} duration={800}>
        <h1 className="mt-8 text-4xl font-semibold tracking-tight text-ink md:text-5xl">
          Hey {displayName},
          <br />
          <span className="text-gradient">welcome aboard!</span>
        </h1>
      </Animate>

      <Animate animation="fade-up" delay={500} duration={700}>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">
          Let&apos;s build your immigration profile in under 2 minutes.
          The more we know, the better strategies we can craft for you.
        </p>
      </Animate>

      <Animate animation="fade-up" delay={700} duration={600}>
        <button
          type="button"
          onClick={onNext}
          className="mt-10 inline-flex h-14 items-center rounded-full bg-accent px-10 text-base font-semibold text-white shadow-glow transition-all duration-200 hover:bg-accent-hover active:scale-[0.97] anim-pulse-glow"
        >
          Let&apos;s go
        </button>
      </Animate>

      <Animate animation="fade-in" delay={900} duration={600}>
        <p className="mt-6 text-sm text-muted">
          Takes about 2 minutes. You can skip anything.
        </p>
      </Animate>
    </div>
  );
}
