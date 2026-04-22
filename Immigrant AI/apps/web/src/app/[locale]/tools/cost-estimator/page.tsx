import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/layout/app-shell";
import { CostEstimator } from "@/components/growth/cost-estimator";
import { EmailCapture } from "@/components/growth/email-capture";
import { ArticleLd, BreadcrumbLd, FaqLd } from "@/components/seo/json-ld";

const SITE_URL = "https://immigrant.guru";

export const metadata: Metadata = {
  title: "Immigration cost estimator — Immigrant Guru",
  description:
    "Estimate the true cost of moving abroad. Government fees, legal, relocation, housing, and hidden costs — all in one place.",
  alternates: { canonical: `${SITE_URL}/tools/cost-estimator` },
  openGraph: {
    title: "Immigration cost estimator",
    description: "Estimate the true cost of moving abroad.",
    url: `${SITE_URL}/tools/cost-estimator`
  }
};

export default async function Page() {
  const t = await getTranslations();

  const faqs = [
    {
      question: t("costEstimator.faq1.question"),
      answer: t("costEstimator.faq1.answer")
    },
    {
      question: t("costEstimator.faq2.question"),
      answer: t("costEstimator.faq2.answer")
    }
  ];

  return (
    <AppShell>
      <BreadcrumbLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Tools", url: `${SITE_URL}/tools` },
          { name: "Cost estimator", url: `${SITE_URL}/tools/cost-estimator` }
        ]}
      />
      <ArticleLd
        headline="Immigration cost estimator"
        description="Estimate the full cost of moving abroad."
        url={`${SITE_URL}/tools/cost-estimator`}
      />
      <FaqLd faqs={faqs} />

      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {t("costEstimator.pageTitle")}
        </h1>
        <p className="mt-4 text-lg text-white/70">
          {t("costEstimator.pageSubtitle")}
        </p>

        <CostEstimator />

        <EmailCapture
          title={t("costEstimator.emailCapture.title")}
          subtitle={t("costEstimator.emailCapture.subtitle")}
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
    </AppShell>
  );
}
