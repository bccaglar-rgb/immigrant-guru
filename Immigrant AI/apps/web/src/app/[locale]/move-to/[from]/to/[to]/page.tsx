import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { LockedContent } from "@/components/growth/locked-content";
import { EmailCapture } from "@/components/growth/email-capture";
import { RelatedPages } from "@/components/seo/related-pages";
import { ArticleLd, BreadcrumbLd, FaqLd, HowToLd } from "@/components/seo/json-ld";
import { getCountry } from "@/data/countries";
import { buildMoveToPairs } from "@/data/seo-pairs";
import { visasByDestination } from "@/data/visa-catalog";
import { buildAlternates } from "@/lib/seo";

const SITE_URL = "https://immigrant.guru";

type PageParams = Promise<{ from: string; to: string }>;

export async function generateStaticParams() {
  return buildMoveToPairs().map((p) => ({ from: p.from, to: p.to }));
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { from: fromSlug, to: toSlug } = await params;
  const from = getCountry(fromSlug);
  const to = getCountry(toSlug);
  if (!from || !to) return {};
  const title = `Move to ${to.name} from ${from.name}: Complete guide (2026)`;
  const description = `Step-by-step guide for ${from.demonym} citizens moving to ${to.name}. Visa options, timelines, costs, and an AI-powered readiness check.`;
  const url = `${SITE_URL}/move-to/${from.slug}/to/${to.slug}`;
  return {
    title,
    description,
    alternates: buildAlternates(`/move-to/${from.slug}/to/${to.slug}`),
    openGraph: { title, description, url }
  };
}

export default async function MoveToPage({ params }: { params: PageParams }) {
  const { from: fromSlug, to: toSlug } = await params;
  const from = getCountry(fromSlug);
  const to = getCountry(toSlug);
  if (!from || !to) notFound();

  const destVisas = visasByDestination(to.slug).slice(0, 6);
  const url = `${SITE_URL}/move-to/${from.slug}/to/${to.slug}`;
  const title = `Move to ${to.name} from ${from.name}`;
  const description = `Complete guide for ${from.demonym} citizens relocating to ${to.name}.`;

  const steps = [
    {
      name: "Pick the right visa pathway",
      text: `Review visa options for ${to.name}, match them to your profile, and shortlist 2–3.`
    },
    {
      name: "Gather evidence",
      text: "Diplomas, language tests, work history, financial statements, and references."
    },
    {
      name: "Prepare the application",
      text: "Use a checklist per visa type to avoid missing any documents."
    },
    {
      name: "Submit and track",
      text: "Submit to the relevant authority and monitor status. Respond quickly to RFEs."
    }
  ];

  const faqs = [
    {
      question: `What is the easiest way to move to ${to.name} from ${from.name}?`,
      answer: destVisas[0]
        ? `For most ${from.demonym} applicants, ${destVisas[0].code} is often the most accessible starting point: ${destVisas[0].summary}`
        : `Routes vary by profile. Start by assessing your eligibility for points-based or employer-sponsored options.`
    },
    {
      question: `How much does it cost to immigrate to ${to.name}?`,
      answer: `Expect total costs between $${Math.min(...destVisas.map((v) => v.typicalCostUsd.min)).toLocaleString()} and $${Math.max(...destVisas.map((v) => v.typicalCostUsd.max)).toLocaleString()} depending on the pathway, not counting relocation and settlement expenses.`
    },
    {
      question: `How long does it take?`,
      answer: `Typical processing ranges from ${Math.min(...destVisas.map((v) => v.typicalTimelineMonths.min))} to ${Math.max(...destVisas.map((v) => v.typicalTimelineMonths.max))} months depending on the pathway.`
    }
  ];

  const relatedLinks = buildMoveToPairs()
    .filter((p) => p.from !== from.slug || p.to !== to.slug)
    .slice(0, 6)
    .map((p) => {
      const f = getCountry(p.from)!;
      const t = getCountry(p.to)!;
      return {
        href: `/move-to/${f.slug}/to/${t.slug}`,
        title: `Move to ${t.name} from ${f.name}`,
        description: `Guide for ${f.demonym} citizens relocating to ${t.name}.`
      };
    });

  return (
    <AppShell>
      <BreadcrumbLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Move to", url: `${SITE_URL}/move-to` },
          { name: `${from.name} to ${to.name}`, url }
        ]}
      />
      <ArticleLd headline={title} description={description} url={url} />
      <FaqLd faqs={faqs} />
      <HowToLd name={title} description={description} steps={steps} />

      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {from.flag} → {to.flag}{" "}
          <span className="block text-3xl font-medium text-white/80 sm:text-4xl">
            Move to {to.name} from {from.name}
          </span>
        </h1>
        <p className="mt-4 text-lg text-white/70">
          A practical guide for {from.demonym} citizens planning to relocate to {to.name}. Pick a
          pathway, understand the timeline and cost, and get a personalized readiness score.
        </p>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold text-white">Top visa pathways for {to.name}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {destVisas.map((v) => (
              <article
                key={v.slug}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    {v.code}
                  </span>
                </div>
                <div className="mt-1 text-lg font-semibold text-white">{v.name}</div>
                <p className="mt-2 text-sm text-white/70">{v.summary}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/60">
                  <span>
                    {v.typicalTimelineMonths.min}–{v.typicalTimelineMonths.max} months
                  </span>
                  <span>•</span>
                  <span>
                    ${v.typicalCostUsd.min.toLocaleString()}–$
                    {v.typicalCostUsd.max.toLocaleString()}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-white">How to move step-by-step</h2>
          <ol className="mt-6 space-y-4">
            {steps.map((step, index) => (
              <li key={step.name} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                  {index + 1}
                </div>
                <div>
                  <div className="text-base font-semibold text-white">{step.name}</div>
                  <p className="mt-1 text-sm text-white/70">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <LockedContent
          heading={`${from.name} → ${to.name} readiness report`}
          teaser={[
            "Personalized to your profile:",
            "• Probability score per pathway",
            "• Evidence gap analysis",
            "• Next 5 concrete actions"
          ]}
          ctaHref="/sign-up"
          ctaLabel="Unlock my report"
        />

        <EmailCapture
          title="Free relocation checklist"
          subtitle="A 24-step PDF checklist, tailored to moving between these two countries."
        />

        <section className="mt-16">
          <h2 className="text-2xl font-semibold text-white">Frequently asked questions</h2>
          <dl className="mt-6 space-y-6">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="text-base font-semibold text-white">{faq.question}</dt>
                <dd className="mt-2 text-white/70">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <RelatedPages heading="More country guides" links={relatedLinks} />
    </AppShell>
  );
}
