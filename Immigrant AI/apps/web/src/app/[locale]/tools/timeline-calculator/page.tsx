import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/layout/app-shell";
import { TimelineCalculator } from "@/components/growth/timeline-calculator";
import { EmailCapture } from "@/components/growth/email-capture";
import { ArticleLd, BreadcrumbLd, FaqLd } from "@/components/seo/json-ld";

const SITE_URL = "https://immigrant.guru";

export const metadata: Metadata = {
  title: "Immigration timeline calculator — Immigrant Guru",
  description:
    "Estimate when you'll arrive based on your chosen pathway: preparation, filing, decision, and landing.",
  alternates: { canonical: `${SITE_URL}/tools/timeline-calculator` },
  openGraph: {
    title: "Immigration timeline calculator",
    description: "Estimate when you'll arrive based on your chosen pathway.",
    url: `${SITE_URL}/tools/timeline-calculator`
  }
};

export default async function Page() {
  const t = await getTranslations();

  const faqs = [
    {
      question: t("timelineCalculator.faq1.question"),
      answer: t("timelineCalculator.faq1.answer")
    },
    {
      question: t("timelineCalculator.faq2.question"),
      answer: t("timelineCalculator.faq2.answer")
    }
  ];

  return (
    <AppShell>
      <BreadcrumbLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Tools", url: `${SITE_URL}/tools` },
          { name: "Timeline calculator", url: `${SITE_URL}/tools/timeline-calculator` }
        ]}
      />
      <ArticleLd
        headline="Immigration timeline calculator"
        description="Estimate your arrival date based on pathway choice."
        url={`${SITE_URL}/tools/timeline-calculator`}
      />
      <FaqLd faqs={faqs} />

      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {t("timelineCalculator.pageTitle")}
        </h1>
        <p className="mt-4 text-lg text-white/70">
          {t("timelineCalculator.pageSubtitle")}
        </p>

        <TimelineCalculator />

        <EmailCapture
          title={t("timelineCalculator.emailCapture.title")}
          subtitle={t("timelineCalculator.emailCapture.subtitle")}
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
