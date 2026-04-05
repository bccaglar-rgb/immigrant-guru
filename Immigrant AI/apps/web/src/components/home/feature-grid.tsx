"use client";

import { Animate, Stagger } from "@/components/ui/animate";
import { SectionContainer } from "@/components/ui/section-container";

const features = [
  {
    icon: "AI",
    color: "from-accent to-[#5e5ce6]",
    title: "AI Copilot Chat",
    description: "Ask anything about your immigration case. Get instant answers with source citations from our curated knowledge base."
  },
  {
    icon: "SIM",
    color: "from-[#5e5ce6] to-purple",
    title: "Scenario Simulation",
    description: "What if you get a Master's degree? Save $30K more? Change countries? See how each change impacts your probability and timeline."
  },
  {
    icon: "VS",
    color: "from-purple to-[#e11d48]",
    title: "Country Comparison",
    description: "Compare USA, Canada, Germany side by side. Processing time, cost, difficulty, and best pathway for each destination."
  },
  {
    icon: "TL",
    color: "from-[#059669] to-[#0d9488]",
    title: "Timeline Projection",
    description: "Visual timeline from profile building to final decision. Know estimated dates for filing, interview, and approval."
  },
  {
    icon: "DOC",
    color: "from-[#d97706] to-[#ea580c]",
    title: "Document Intelligence",
    description: "Upload documents. AI classifies, checks completeness, detects issues, and generates a checklist tailored to your visa."
  },
  {
    icon: "KB",
    color: "from-[#0ea5e9] to-accent",
    title: "Knowledge Base",
    description: "352 curated chunks from official immigration sources. Every AI recommendation is grounded in verified data, not guesswork."
  }
];

export function FeatureGrid() {
  return (
    <SectionContainer
      className="bg-white"
      eyebrow="Platform Features"
      title="Everything you need in one place"
      description="Six powerful tools working together to give you clarity, confidence, and a concrete plan."
    >
      <Stagger
        className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 items-stretch"
        childClassName="h-full"
        animation="fade-up"
        staggerDelay={100}
        duration={600}
      >
        {features.map((feature) => (
          <div
            key={feature.title}
            className="group flex h-full flex-col rounded-2xl border border-line bg-canvas/40 p-8 transition-all duration-300 hover:border-accent/10 hover:bg-white hover:shadow-soft hover:-translate-y-0.5"
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} text-xs font-bold text-white transition-transform duration-300 group-hover:scale-110`}>
              {feature.icon}
            </div>
            <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">
              {feature.title}
            </h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink/55">
              {feature.description}
            </p>
          </div>
        ))}
      </Stagger>
    </SectionContainer>
  );
}
