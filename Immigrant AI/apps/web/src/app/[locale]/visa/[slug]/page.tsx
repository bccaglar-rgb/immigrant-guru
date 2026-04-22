import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { EmailCapture } from "@/components/growth/email-capture";
import { LockedContent } from "@/components/growth/locked-content";
import { RelatedPages } from "@/components/seo/related-pages";
import { ArticleLd, BreadcrumbLd, FaqLd } from "@/components/seo/json-ld";
import { getCountry } from "@/data/countries";
import { VISAS, getVisa } from "@/data/visa-catalog";
import { buildAlternates } from "@/lib/seo";

const SITE_URL = "https://immigrant.guru";

type PageParams = Promise<{ slug: string }>;

export function generateStaticParams() {
  return VISAS.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { slug } = await params;
  const visa = getVisa(slug);
  if (!visa) return {};
  const country = getCountry(visa.destination);
  const title = `${visa.code} — cost, timeline & eligibility (2026)`;
  const description = `${visa.name} guide: cost $${visa.typicalCostUsd.min.toLocaleString()}–$${visa.typicalCostUsd.max.toLocaleString()}, timeline ${visa.typicalTimelineMonths.min}–${visa.typicalTimelineMonths.max} months. ${country?.name ?? ""}.`;
  const url = `${SITE_URL}/visa/${visa.slug}`;
  return {
    title,
    description,
    alternates: buildAlternates(`/visa/${visa.slug}`),
    openGraph: { title, description, url }
  };
}

export default async function VisaDetailPage({ params }: { params: PageParams }) {
  const { slug } = await params;
  const visa = getVisa(slug);
  if (!visa) notFound();
  const country = getCountry(visa.destination);
  const url = `${SITE_URL}/visa/${visa.slug}`;
  const t = await getTranslations();
  const title = `${visa.code} — ${visa.name}`;
  const description = visa.summary;

  const faqs = [
    {
      question: `How much does the ${visa.code} cost?`,
      answer: `Total typical cost ranges $${visa.typicalCostUsd.min.toLocaleString()}–$${visa.typicalCostUsd.max.toLocaleString()} including government fees and legal representation.`
    },
    {
      question: `How long does the ${visa.code} take?`,
      answer: `Processing typically takes ${visa.typicalTimelineMonths.min}–${visa.typicalTimelineMonths.max} months, plus evidence-gathering time upfront.`
    },
    {
      question: `Does the ${visa.code} lead to permanent residency?`,
      answer: visa.pathToPermanentResidency
        ? `Yes — the ${visa.code} has a clear path to permanent residency in ${country?.name ?? "the destination country"}.`
        : `No — the ${visa.code} is a temporary visa. You would need to transition to a separate PR pathway.`
    },
    {
      question: `Why do ${visa.code} applications get rejected?`,
      answer: `Most rejections stem from: ${visa.risks.join("; ")}.`
    }
  ];

  const related = VISAS.filter((v) => v.slug !== visa.slug && v.destination === visa.destination)
    .slice(0, 4)
    .map((v) => ({
      href: `/visa/${v.slug}`,
      title: `${v.code} — ${v.name}`,
      description: v.summary.slice(0, 120)
    }));

  return (
    <AppShell>
      <BreadcrumbLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Visas", url: `${SITE_URL}/visa` },
          { name: visa.code, url }
        ]}
      />
      <ArticleLd headline={title} description={description} url={url} />
      <FaqLd faqs={faqs} />

      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <nav className="mb-6 text-sm text-white/60">
          <Link href="/" className="hover:text-white">{t("Home")}</Link>
          <span className="mx-2">/</span>
          <span>{country?.flag} {country?.name}</span>
          <span className="mx-2">/</span>
          <span>{visa.code}</span>
        </nav>

        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {visa.code}: {visa.name}
        </h1>
        <p className="mt-4 text-lg text-white/70">{visa.summary}</p>

        <dl className="mt-8 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <dt className="text-white/50">{t("visa.cost")}</dt>
            <dd className="mt-1 text-lg font-semibold text-white">
              ${visa.typicalCostUsd.min.toLocaleString()}–${visa.typicalCostUsd.max.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <dt className="text-white/50">{t("Timeline")}</dt>
            <dd className="mt-1 text-lg font-semibold text-white">
              {visa.typicalTimelineMonths.min}–{visa.typicalTimelineMonths.max} months
            </dd>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <dt className="text-white/50">{t("visaMatch.duration")}</dt>
            <dd className="mt-1 text-lg font-semibold text-white">{visa.typicalDuration}</dd>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <dt className="text-white/50">{t("visa.prPath")}</dt>
            <dd className="mt-1 text-lg font-semibold text-white">
              {visa.pathToPermanentResidency ? t("compare.yes") : t("compare.no")}
            </dd>
          </div>
        </dl>

        <section className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">{t("visa.idealFor")}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/70">
              {visa.idealFor.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">{t("visa.requirements")}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/70">
              {visa.requirements.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">{t("visaMatch.strengths")}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/70">
              {visa.strengths.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">{t("visa.risksAndRejection")}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/70">
              {visa.risks.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/sign-up"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90"
          >
            {t("visa.checkReadiness", { code: visa.code })}
          </Link>
          <Link
            href="/tools/eligibility-checker"
            className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:border-white/50"
          >
            {t("visaMatch.freeEligibilityCheck")}
          </Link>
        </div>

        <LockedContent
          heading={`Your personalized ${visa.code} readiness report`}
          teaser={[
            `• Fit score for the ${visa.code}`,
            `• Missing evidence checklist`,
            `• Realistic timeline from your starting point`,
            `• Cost breakdown for your specific case`
          ]}
          ctaHref="/sign-up"
          ctaLabel="Unlock my full report"
        />

        <EmailCapture
          title={`Get the ${visa.code} evidence checklist`}
          subtitle="Free — 12 documents you'll need, organized by priority."
        />

        <section className="mt-16">
          <h2 className="text-2xl font-semibold text-white">{t("FAQ")}</h2>
          <dl className="mt-6 space-y-6">
            {faqs.map((f) => (
              <div key={f.question}>
                <dt className="text-base font-semibold text-white">{f.question}</dt>
                <dd className="mt-2 text-white/70">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <RelatedPages
        heading={t("visa.moreVisaGuides", { countryName: country?.name ?? "" })}
        links={related}
      />
    </AppShell>
  );
}
