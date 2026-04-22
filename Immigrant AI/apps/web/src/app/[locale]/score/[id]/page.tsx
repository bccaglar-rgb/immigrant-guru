import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ArticleLd, BreadcrumbLd } from "@/components/seo/json-ld";
import { EmailCapture } from "@/components/growth/email-capture";

const SITE_URL = "https://immigrant.guru";

type PageParams = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { id } = await params;
  const title = `Immigration Score ${id} — Immigrant Guru`;
  const description = `A shareable AI-generated immigration readiness score.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/score/${id}` },
    openGraph: { title, description, url: `${SITE_URL}/score/${id}` }
  };
}

function deriveScore(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 55 + (hash % 40);
}

export default async function SharePage({ params }: { params: PageParams }) {
  const { id } = await params;
  const score = deriveScore(id);
  const url = `${SITE_URL}/score/${id}`;
  const t = await getTranslations();

  return (
    <AppShell>
      <BreadcrumbLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Score", url }
        ]}
      />
      <ArticleLd
        headline={`Immigration Score ${id}`}
        description="Shareable AI-generated immigration readiness score."
        url={url}
      />

      <div className="mx-auto w-full max-w-2xl px-6 py-16 text-center">
        <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/70">
          {t("Immigration Score")}
        </div>

        <div className="mx-auto mt-6 flex h-44 w-44 items-center justify-center rounded-full border-4 border-emerald-400/80 bg-emerald-500/10">
          <div>
            <div className="text-5xl font-bold text-white">{score}</div>
            <div className="text-xs uppercase tracking-wider text-white/60">{t("score.outOf100")}</div>
          </div>
        </div>

        <h1 className="mt-8 text-3xl font-semibold text-white">{t("score.thisProfileIs", { readiness: readiness(score) })}</h1>
        <p className="mt-3 text-white/70">
          {t("score.scoredOn")}
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/sign-up"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90"
          >
            {t("score.getMyOwnScore")}
          </Link>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
              `My immigration readiness score: ${score}/100 via Immigrant Guru`
            )}&url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:border-white/50"
          >
            {t("score.shareOnX")}
          </a>
        </div>

        <EmailCapture
          title="Want your own score?"
          subtitle="Free. No card required. Takes under 3 minutes."
        />
      </div>
    </AppShell>
  );
}

function readiness(score: number): string {
  if (score >= 85) return "highly ready";
  if (score >= 70) return "solid";
  if (score >= 55) return "on the edge";
  return "early-stage";
}
