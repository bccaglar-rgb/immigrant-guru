import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { EmailCapture } from "@/components/growth/email-capture";
import { RelatedPages } from "@/components/seo/related-pages";
import { ArticleLd, BreadcrumbLd, FaqLd } from "@/components/seo/json-ld";
import { DESTINATION_COUNTRIES } from "@/data/countries";
import { PROFILES, getProfile } from "@/data/profiles";
import { topVisasForProfileDestination } from "@/data/seo-pairs";

const SITE_URL = "https://immigrant.guru";

type PageParams = Promise<{ profession: string }>;

export function generateStaticParams() {
  return PROFILES.map((p) => ({ profession: p.slug }));
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { profession } = await params;
  const profile = getProfile(profession);
  if (!profile) return {};
  const title = `Best countries for ${profile.shortTitle.toLowerCase()} to immigrate to (2026)`;
  const description = `Ranked list of the best immigration destinations for ${profile.shortTitle.toLowerCase()} — timeline, cost, and top visa for each.`;
  const url = `${SITE_URL}/best-countries/${profile.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url }
  };
}

function scoreDestination(profileSlug: string, destinationSlug: string): number {
  const top = topVisasForProfileDestination(profileSlug, destinationSlug);
  if (top.length === 0) return 0;
  const avgTime = top.reduce((s, v) => s + (v.typicalTimelineMonths.min + v.typicalTimelineMonths.max) / 2, 0) / top.length;
  const avgCost = top.reduce((s, v) => s + (v.typicalCostUsd.min + v.typicalCostUsd.max) / 2, 0) / top.length;
  const prBonus = top.filter((v) => v.pathToPermanentResidency).length * 5;
  return 100 - avgTime - avgCost / 1000 + prBonus;
}

export default async function BestCountriesPage({ params }: { params: PageParams }) {
  const { profession } = await params;
  const profile = getProfile(profession);
  if (!profile) notFound();

  const ranked = DESTINATION_COUNTRIES
    .map((c) => ({
      country: c,
      score: scoreDestination(profile.slug, c.slug),
      topVisas: topVisasForProfileDestination(profile.slug, c.slug)
    }))
    .filter((r) => r.topVisas.length > 0)
    .sort((a, b) => b.score - a.score);

  const url = `${SITE_URL}/best-countries/${profile.slug}`;
  const title = `Best countries for ${profile.shortTitle.toLowerCase()} to immigrate to`;
  const description = `Ranked immigration destinations for ${profile.shortTitle.toLowerCase()}.`;

  const faqs = [
    {
      question: `Which country is easiest for ${profile.shortTitle.toLowerCase()} to immigrate to?`,
      answer: ranked[0]
        ? `${ranked[0].country.name} ranks highest for ${profile.shortTitle.toLowerCase()} — top pathway is ${ranked[0].topVisas[0]?.code} (${ranked[0].topVisas[0]?.typicalTimelineMonths.min}–${ranked[0].topVisas[0]?.typicalTimelineMonths.max} months).`
        : `It depends on your specific profile, but the countries below rank well.`
    },
    {
      question: `Do ${profile.shortTitle.toLowerCase()} need a job offer to immigrate?`,
      answer: `Not always — several of the top-ranked destinations have self-petition or points-based pathways that don't require an employer sponsor.`
    }
  ];

  const related = PROFILES.filter((p) => p.slug !== profile.slug)
    .slice(0, 6)
    .map((p) => ({
      href: `/best-countries/${p.slug}`,
      title: `Best countries for ${p.shortTitle.toLowerCase()}`,
      description: p.description
    }));

  return (
    <AppShell>
      <BreadcrumbLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Best countries", url: `${SITE_URL}/best-countries` },
          { name: profile.title, url }
        ]}
      />
      <ArticleLd headline={title} description={description} url={url} />
      <FaqLd faqs={faqs} />

      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <nav className="mb-6 text-sm text-white/60">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/best-countries" className="hover:text-white">Best countries</Link>
          <span className="mx-2">/</span>
          <span>{profile.title}</span>
        </nav>

        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Best countries for {profile.shortTitle.toLowerCase()}
        </h1>
        <p className="mt-4 text-lg text-white/70">
          Ranked by cost, timeline, and path-to-PR. Data current for 2026.
        </p>

        <ol className="mt-10 space-y-4">
          {ranked.map((row, i) => {
            const topVisa = row.topVisas[0];
            return (
              <li
                key={row.country.slug}
                className="rounded-3xl border border-white/10 bg-white/5 p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-white/60">#{i + 1}</span>
                  <span className="text-2xl">{row.country.flag}</span>
                  <h2 className="text-xl font-semibold text-white">{row.country.name}</h2>
                </div>
                {topVisa ? (
                  <div className="mt-3 text-sm text-white/70">
                    Top pathway: <span className="text-white">{topVisa.code}</span> — {topVisa.typicalTimelineMonths.min}–{topVisa.typicalTimelineMonths.max} months · ${topVisa.typicalCostUsd.min.toLocaleString()}–${topVisa.typicalCostUsd.max.toLocaleString()}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/visa-match/${row.country.slug}/${profile.slug}`}
                    className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-white hover:border-white/50"
                  >
                    See all pathways
                  </Link>
                  {topVisa ? (
                    <Link
                      href={`/visa/${topVisa.slug}`}
                      className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-white hover:border-white/50"
                    >
                      {topVisa.code} details
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        <EmailCapture
          title={`Get a personalized ranking for your ${profile.shortTitle.toLowerCase()} profile`}
          subtitle="We'll score your fit for all 10 destinations based on your actual background."
        />

        <section className="mt-16">
          <h2 className="text-2xl font-semibold text-white">Frequently asked questions</h2>
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

      <RelatedPages heading="Other professions" links={related} />
    </AppShell>
  );
}
