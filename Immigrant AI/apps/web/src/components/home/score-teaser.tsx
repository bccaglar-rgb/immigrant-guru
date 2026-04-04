"use client";

import { Animate } from "@/components/ui/animate";
import { SectionContainer } from "@/components/ui/section-container";

const scoreSignals = [
  "Profile depth and readiness",
  "Target-country fit",
  "Program alignment",
  "Risk and preparation gaps"
];

export function ScoreTeaser() {
  return (
    <SectionContainer
      className="scroll-mt-24"
      description="Deterministic scoring combined with case and profile signals so you can understand readiness without guesswork."
      eyebrow="Immigration Score"
      title="Explainable readiness signals"
    >
      <div className="grid gap-6 lg:grid-cols-2" id="score">
        <Animate animation="slide-left" duration={800}>
          <div className="glass-card rounded-3xl p-8 md:p-10 h-full">
            <p className="text-sm font-semibold text-accent">Score Preview</p>
            <div className="mt-6 flex items-end gap-2">
              <span className="text-7xl font-bold tracking-tight text-ink md:text-8xl anim-count">72</span>
              <span className="mb-3 text-2xl font-medium text-muted">/100</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Scores combine profile completeness, professional strength,
              financial readiness, and case readiness into a transparent signal
              you can improve over time.
            </p>
            <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-ink/5">
              <div
                className="h-full rounded-full bg-gradient-accent anim-fill-bar"
                style={{ width: "72%" }}
              />
            </div>
          </div>
        </Animate>

        <Animate animation="slide-right" duration={800} delay={150}>
          <div className="glass-card rounded-3xl p-8 md:p-10 h-full">
            <p className="text-sm font-semibold text-accent">Signal Inputs</p>
            <div className="mt-6 space-y-3">
              {scoreSignals.map((signal, index) => (
                <Animate key={signal} animation="fade-up" delay={300 + index * 100} duration={500}>
                  <div className="flex items-center justify-between rounded-xl border border-line bg-canvas/50 px-5 py-3.5 transition-all duration-200 hover:bg-white hover:shadow-card">
                    <span className="text-sm font-medium text-ink">{signal}</span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green/10 text-xs text-green">
                      {"\u2713"}
                    </span>
                  </div>
                </Animate>
              ))}
            </div>
          </div>
        </Animate>
      </div>
    </SectionContainer>
  );
}
