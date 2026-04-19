import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { LockedContent } from "@/components/growth/locked-content";
import { EmailCapture } from "@/components/growth/email-capture";
import { RelatedPages } from "@/components/seo/related-pages";
import { ArticleLd, BreadcrumbLd, FaqLd } from "@/components/seo/json-ld";
import { getCountry } from "@/data/countries";
import { getProfile, PROFILES } from "@/data/profiles";
import { buildVisaMatchPairs, topVisasForProfileDestination } from "@/data/seo-pairs";

const SITE_URL = "https://immigrant.guru";

type PageParams = Promise<{ country: string; profile: string }>;

export async function generateStaticParams() {
  return buildVisaMatchPairs().map((pair) => ({
    country: pair.destination,
    profile: pair.profile
  }));
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { country: countrySlug, profile: profileSlug } = await params;
  const country = getCountry(countrySlug);
  const profile = getProfile(profileSlug);
  if (!country || !profile) return {};
  const title = `Best visa for ${profile.shortTitle.toLowerCase()} in ${country.name} (2026)`;
  const description = `Compare the top immigration pathways for ${profile.shortTitle.toLowerCase()} moving to ${country.name}. Eligibility, cost, timeline, and AI-powered personalized match.`;
  const url = `${SITE_URL}/visa-match/${country.slug}/${profile.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url }
  };
}

export default async function VisaMatchPage({ params }: { params: PageParams }) {
  const { country: countrySlug, profile: profileSlug } = await params;
  const country = getCountry(countrySlug);
  const profile = getProfile(profileSlug);
  if (!country || !profile) notFound();

  const topVisas = topVisasForProfileDestination(profile.slug, country.slug);
  const url = `${SITE_URL}/visa-match/${country.slug}/${profile.slug}`;
  const title = `Best visa for ${profile.shortTitle.toLowerCase()} moving to ${country.name}`;
  const description = `Compare the top immigration pathways for ${profile.shortTitle.toLowerCase()} moving to ${country.name}.`;

  const faqs = [
    {
      question: `What is the best visa for a ${profile.title.toLowerCase()} in ${country.name}?`,
      answer: topVisas[0]
        ? `${topVisas[0].code} — ${topVisas[0].summary} Typical timeline is ${topVisas[0].typicalTimelineMonths.min}–${topVisas[0].typicalTimelineMonths.max} months.`
        : `Our AI analyzes several pathways depending on your specific profile and goals.`
    },
    {
      question: `How long does it take to move to ${country.name} as a ${profile.title.toLowerCase()}?`,
      answer: topVisas[0]
        ? `Processing typically ranges ${topVisas[0].typicalTimelineMonths.min}–${topVisas[0].typicalTimelineMonths.max} months for the top-recommended path, plus preparation time to gather evidence.`
        : `Most employment-based pathways take between 3 and 18 months depending on the country and pathway.`
    },
    {
      question: `Do I need a job offer to immigrate to ${country.name}?`,
      answer: `Not always. ${country.name} has self-petition and points-based options as well as employer-sponsored paths — the right one depends on your profile.`
    }
  ];

  const relatedLinks = PROFILES.filter((p) => p.slug !== profile.slug)
    .slice(0, 6)
    .map((p) => ({
      href: `/visa-match/${country.slug}/${p.slug}`,
      title: `Best visa for ${p.shortTitle.toLowerCase()} in ${country.name}`,
      description: p.description
    }));

  return (
    <AppShell>
      <BreadcrumbLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Visa Match", url: `${SITE_URL}/visa-match` },
          { name: country.name, url: `${SITE_URL}/visa-match/${country.slug}` },
          { name: profile.title, url }
        ]}
      />
      <ArticleLd headline={title} description={description} url={url} />
      <FaqLd faqs={faqs} />

      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <nav className="mb-6 text-sm text-white/60">
          <Link href="/" className="hover:text-white">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/visa-match" className="hover:text-white">
            Visa Match
          </Link>
          <span className="mx-2">/</span>
          <span>
            {country.flag} {country.name}
          </span>
          <span className="mx-2">/</span>
          <span>{profile.title}</span>
        </nav>

        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Best visa for {profile.shortTitle.toLowerCase()} moving to {country.name}
        </h1>
        <p className="mt-4 text-lg text-white/70">
          We ranked {topVisas.length} immigration pathways for {profile.shortTitle.toLowerCase()}
          {" "}relocating to {country.name}. Each option is scored on fit, cost, time, and risk.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/sign-up"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90"
          >
            Get your personalized match
          </Link>
          <Link
            href="/tools/eligibility-checker"
            className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:border-white/50"
          >
            Free eligibility check
          </Link>
        </div>

        <section className="mt-12 space-y-6">
          {topVisas.map((visa, index) => (
            <article
              key={visa.slug}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                  Plan {String.fromCharCode(65 + index)}
                </span>
                <span className="text-sm font-medium text-white/70">{visa.code}</span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-white">{visa.name}</h2>
              <p className="mt-2 text-white/70">{visa.summary}</p>

              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-white/50">Typical timeline</dt>
                  <dd className="mt-1 font-medium text-white">
                    {visa.typicalTimelineMonths.min}–{visa.typicalTimelineMonths.max} months
                  </dd>
                </div>
                <div>
                  <dt className="text-white/50">Typical cost</dt>
                  <dd className="mt-1 font-medium text-white">
                    ${visa.typicalCostUsd.min.toLocaleString()}–${visa.typicalCostUsd.max.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/50">Duration</dt>
                  <dd className="mt-1 font-medium text-white">{visa.typicalDuration}</dd>
                </div>
                <div>
                  <dt className="text-white/50">Leads to PR</dt>
                  <dd className="mt-1 font-medium text-white">
                    {visa.pathToPermanentResidency ? "Yes" : "No"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold text-white">Strengths</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
                    {visa.strengths.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Risks</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
                    {visa.risks.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </section>

        <LockedContent
          heading="Your personalized readiness score"
          teaser={[
            `Based on a ${profile.title.toLowerCase()} profile targeting ${country.name}:`,
            `• Estimated readiness: 68/100`,
            `• Top match: ${topVisas[0]?.code ?? "—"}`,
            `• Risk level: Medium`
          ]}
          ctaHref="/sign-up"
          ctaLabel="Unlock my full report"
        />

        <EmailCapture
          title={`Get the ${profile.title} → ${country.name} playbook`}
          subtitle="We'll send a free 12-step checklist tailored to this pathway."
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

      <RelatedPages
        heading={`More visa guides for ${country.name}`}
        links={relatedLinks}
      />
    </AppShell>
  );
}
