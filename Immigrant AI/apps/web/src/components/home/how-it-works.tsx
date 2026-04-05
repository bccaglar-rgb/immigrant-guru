"use client";

import { Animate, Stagger } from "@/components/ui/animate";
import { SectionContainer } from "@/components/ui/section-container";

const steps = [
  {
    num: "01",
    title: "Build your profile",
    description: "Answer fun questions about your nationality, education, profession, and goals. Takes 2 minutes.",
    highlight: false
  },
  {
    num: "02",
    title: "Create a case",
    description: "Pick your target country and visa program. Upload your documents. Your case workspace is ready.",
    highlight: false
  },
  {
    num: "03",
    title: "Get AI strategy",
    description: "AI analyzes your profile against 47 visa categories and generates Plan A, B, and C with confidence scores.",
    highlight: true
  },
  {
    num: "04",
    title: "Take action",
    description: "Follow your next best action, complete your document checklist, and track your timeline to approval.",
    highlight: false
  }
];

export function HowItWorks() {
  return (
    <SectionContainer
      eyebrow="How It Works"
      title="From uncertainty to a plan in 4 steps"
      description="No lawyers needed to get started. Build clarity before you spend."
    >
      <Stagger
        className="grid grid-cols-1 gap-5 md:grid-cols-4 items-stretch"
        childClassName="h-full"
        animation="fade-up"
        staggerDelay={120}
        duration={600}
      >
        {steps.map((step) => (
          <div
            key={step.num}
            className={`group flex h-full flex-col rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 ${
              step.highlight
                ? "bg-accent text-white shadow-glow"
                : "border border-line bg-white hover:shadow-soft"
            }`}
          >
            <span className={`text-4xl font-semibold tracking-tight ${
              step.highlight ? "text-white/30" : "text-accent/20"
            }`}>
              {step.num}
            </span>
            <h3 className={`mt-4 text-lg font-semibold tracking-tight ${
              step.highlight ? "text-white" : "text-ink"
            }`}>
              {step.title}
            </h3>
            <p className={`mt-2 flex-1 text-sm leading-relaxed ${
              step.highlight ? "text-white/70" : "text-ink/55"
            }`}>
              {step.description}
            </p>
          </div>
        ))}
      </Stagger>
    </SectionContainer>
  );
}
