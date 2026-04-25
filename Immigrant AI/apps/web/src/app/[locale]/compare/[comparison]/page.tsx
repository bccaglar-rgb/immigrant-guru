import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { LockedContent } from "@/components/growth/locked-content";
import { EmailCapture } from "@/components/growth/email-capture";
import { RelatedPages } from "@/components/seo/related-pages";
import { ArticleLd, BreadcrumbLd, FaqLd } from "@/components/seo/json-ld";
import { COMPARISONS, getComparison } from "@/data/seo-pairs";
import { getVisa } from "@/data/visa-catalog";
import { buildAlternates } from "@/lib/seo";

const SITE_URL = "https://immigrant.guru";

function Row({
  label,
  valueA,
  valueB
}: {
  label: string;
  valueA: string;
  valueB: string;
}) {
  return (
    <tr className="border-t border-white/10">
      <th scope="row" className="py-3 pr-4 text-left text-sm text-white/60">
        {label}
      </th>
      <td className="py-3 pr-4 text-sm text-white">{valueA}</td>
      <td className="py-3 text-sm text-white">{valueB}</td>
    </tr>
  );
}

type PageParams = Promise<{ comparison: string }>;

export async function generateStaticParams() {
  return COMPARISONS.map((c) => ({ comparison: c.slug }));
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { comparison } = await params;
  const pair = getComparison(comparison);
  if (!pair) return {};
  const a = getVisa(pair.visaA);
  const b = getVisa(pair.visaB);
  if (!a || !b) return {};
  const title = `${a.code} vs ${b.code}: Which visa is right for you? (2026)`;
  const description = `${a.name} or ${b.name}? Side-by-side comparison of cost, timeline, risks, and who each visa fits best.`;
  const url = `${SITE_URL}/compare/${pair.slug}`;
  return {
    title,
    description,
    alternates: buildAlternates(`/compare/${pair.slug}`),
    openGraph: { title, description, url }
  };
}

export default async function ComparePage({ params }: { params: PageParams }) {
  const { comparison } = await params;
  const pair = getComparison(comparison);
  if (!pair) notFound();
  const a = getVisa(pair.visaA);
  const b = getVisa(pair.visaB);
  if (!a || !b) notFound();
  const t = await getTranslations();

  const url = `${SITE_URL}/compare/${pair.slug}`;
  const title = `${a.code} vs ${b.code}`;
  const description = `${a.name} vs ${b.name}: cost, timeline, and fit.`;

  const faqs = [
    {
      question: `What is the main difference between ${a.code} and ${b.code}?`,
      answer: `${a.code} is ${a.summary.toLowerCase()} ${b.code} is ${b.summary.toLowerCase()}`
    },
    {
      question: `Which is faster, ${a.code} or ${b.code}?`,
      answer:
        a.typicalTimelineMonths.max <= b.typicalTimelineMonths.max
          ? `${a.code} typically processes in ${a.typicalTimelineMonths.min}–${a.typicalTimelineMonths.max} months versus ${b.typicalTimelineMonths.min}–${b.typicalTimelineMonths.max} months for ${b.code}.`
          : `${b.code} typically processes in ${b.typicalTimelineMonths.min}–${b.typicalTimelineMonths.max} months versus ${a.typicalTimelineMonths.min}–${a.typicalTimelineMonths.max} months for ${a.code}.`
    },
    {
      question: `Which costs less, ${a.code} or ${b.code}?`,
      answer:
        a.typicalCostUsd.max <= b.typicalCostUsd.max
          ? `${a.code} is usually cheaper: $${a.typicalCostUsd.min.toLocaleString()}–$${a.typicalCostUsd.max.toLocaleString()} versus $${b.typicalCostUsd.min.toLocaleString()}–$${b.typicalCostUsd.max.toLocaleString()} for ${b.code}.`
          : `${b.code} is usually cheaper: $${b.typicalCostUsd.min.toLocaleString()}–$${b.typicalCostUsd.max.toLocaleString()} versus $${a.typicalCostUsd.min.toLocaleString()}–$${a.typicalCostUsd.max.toLocaleString()} for ${a.code}.`
    }
  ];

  const relatedLinks = COMPARISONS.filter((c) => c.slug !== pair.slug)
    .slice(0, 6)
    .map((c) => {
      const va = getVisa(c.visaA);
      const vb = getVisa(c.visaB);
      return {
        href: `/compare/${c.slug}`,
        title: `${va?.code ?? ""} vs ${vb?.code ?? ""}`,
        description: `Compare ${va?.name ?? ""} and ${vb?.name ?? ""}.`
      };
    });

  return (
    <AppShell>
      <BreadcrumbLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Compare", url: `${SITE_URL}/compare` },
          { name: `${a.code} vs ${b.code}`, url }
        ]}
      />
      <ArticleLd headline={title} description={description} url={url} />
      <FaqLd faqs={faqs} />

      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {a.code} vs {b.code}
        </h1>
        <p className="mt-4 text-lg text-white/70">
          {t("compare.comparingSubtitle", { nameA: a.name, nameB: b.name })}
        </p>

        <div className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <table className="w-full">
            <thead>
              <tr>
                <th className="py-3 pr-4 text-left text-xs uppercase tracking-wider text-white/50"></th>
                <th className="py-3 pr-4 text-left text-base font-semibold text-white">{a.code}</th>
                <th className="py-3 text-left text-base font-semibold text-white">{b.code}</th>
              </tr>
            </thead>
            <tbody className="px-4">
              <Row label={t("compare.rowFullName")} valueA={a.name} valueB={b.name} />
              <Row label={t("compare.rowCategory")} valueA={a.category} valueB={b.category} />
              <Row label={t("compare.rowDestination")} valueA={a.destination} valueB={b.destination} />
              <Row label={t("compare.rowTypicalDuration")} valueA={a.typicalDuration} valueB={b.typicalDuration} />
              <Row
                label={t("Timeline")}
                valueA={`${a.typicalTimelineMonths.min}–${a.typicalTimelineMonths.max} mo`}
                valueB={`${b.typicalTimelineMonths.min}–${b.typicalTimelineMonths.max} mo`}
              />
              <Row
                label={t("compare.rowCostUsd")}
                valueA={`$${a.typicalCostUsd.min.toLocaleString()}–$${a.typicalCostUsd.max.toLocaleString()}`}
                valueB={`$${b.typicalCostUsd.min.toLocaleString()}–$${b.typicalCostUsd.max.toLocaleString()}`}
              />
              <Row
                label={t("compare.rowLeadsToPR")}
                valueA={a.pathToPermanentResidency ? t("compare.yes") : t("compare.no")}
                valueB={b.pathToPermanentResidency ? t("compare.yes") : t("compare.no")}
              />
            </tbody>
          </table>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">{t("compare.bestFor")}</div>
            <div className="mt-1 text-lg font-semibold text-white">{a.code}</div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/70">
              {a.idealFor.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">{t("compare.bestFor")}</div>
            <div className="mt-1 text-lg font-semibold text-white">{b.code}</div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/70">
              {b.idealFor.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <LockedContent
          heading="Which one fits you?"
          teaser={[
            "Our AI scores your profile against both options on 12 dimensions.",
            "• Match score for each pathway",
            "• Estimated timeline for your specific case",
            "• Risk factors flagged for your evidence"
          ]}
          ctaHref="/sign-up"
          ctaLabel="Get my personalized match"
        />

        <EmailCapture
          title={`${a.code} vs ${b.code} checklist`}
          subtitle="A side-by-side evidence checklist emailed to you for free."
        />

        <section className="mt-16">
          <h2 className="text-2xl font-semibold text-white">{t("FAQ")}</h2>
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

      <RelatedPages heading={t("compare.otherComparisons")} links={relatedLinks} />
    </AppShell>
  );
}
