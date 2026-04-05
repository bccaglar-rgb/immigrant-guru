"use client";

import { Animate, Stagger } from "@/components/ui/animate";

const cases = [
  {
    emoji: "W",
    title: "Work abroad",
    description: "Find the right work visa for your skills and experience. H-1B, EB-2, O-1, and more.",
    color: "from-accent to-[#5e5ce6]"
  },
  {
    emoji: "S",
    title: "Study abroad",
    description: "F-1, OPT, STEM extension — understand your path from student to professional.",
    color: "from-[#5e5ce6] to-purple"
  },
  {
    emoji: "F",
    title: "Move with family",
    description: "Spouse, children, parents — know which family visa fits and how long it takes.",
    color: "from-[#059669] to-[#0d9488]"
  },
  {
    emoji: "B",
    title: "Start a business",
    description: "E-2 investor, EB-5, startup visa — explore entrepreneurial immigration routes.",
    color: "from-[#d97706] to-[#ea580c]"
  }
];

export function UseCases() {
  return (
    <section className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <Animate animation="fade-up" duration={700}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-accent">For every situation</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              Whatever your reason, we can help.
            </h2>
          </div>
        </Animate>

        <Stagger
          className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 items-stretch"
          childClassName="h-full"
          animation="fade-up"
          staggerDelay={100}
          duration={600}
        >
          {cases.map((c) => (
            <div
              key={c.title}
              className="group flex h-full flex-col rounded-2xl border border-line bg-canvas/40 p-7 transition-all duration-300 hover:border-accent/10 hover:bg-white hover:shadow-soft hover:-translate-y-0.5"
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${c.color} text-sm font-bold text-white`}>
                {c.emoji}
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink">{c.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{c.description}</p>
            </div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
