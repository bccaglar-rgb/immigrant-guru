import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { EligibilityChecker } from "@/components/growth/eligibility-checker";
import { EmailCapture } from "@/components/growth/email-capture";
import { ArticleLd, BreadcrumbLd, FaqLd } from "@/components/seo/json-ld";

const SITE_URL = "https://immigrant.guru";

export const metadata: Metadata = {
  title: "Free visa eligibility checker — Immigrant Guru",
  description:
    "Check your eligibility for top US, Canada, UK, and EU visas in under 60 seconds. No sign-up required. Powered by AI.",
  alternates: { canonical: `${SITE_URL}/tools/eligibility-checker` },
  openGraph: {
    title: "Free visa eligibility checker",
    description: "Check your eligibility for top immigration pathways in under 60 seconds.",
    url: `${SITE_URL}/tools/eligibility-checker`
  }
};

export default function Page() {
  const faqs = [
    {
      question: "Is the eligibility checker free?",
      answer: "Yes. It runs entirely in your browser and doesn't require an account."
    },
    {
      question: "How accurate is the check?",
      answer:
        "It uses public eligibility rules per pathway. It's a strong first filter but not a substitute for the AI-powered full analysis or legal advice."
    },
    {
      question: "Will it store my answers?",
      answer:
        "No. The tool runs locally in your browser. Sign up if you want your results saved to your profile."
    }
  ];

  return (
    <AppShell>
      <BreadcrumbLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Tools", url: `${SITE_URL}/tools` },
          { name: "Eligibility checker", url: `${SITE_URL}/tools/eligibility-checker` }
        ]}
      />
      <ArticleLd
        headline="Free visa eligibility checker"
        description="Instantly check your eligibility for the top US, Canada, UK, and EU visas."
        url={`${SITE_URL}/tools/eligibility-checker`}
      />
      <FaqLd faqs={faqs} />

      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Free visa eligibility checker
        </h1>
        <p className="mt-4 text-lg text-white/70">
          Answer 6 quick questions. Get a shortlist of visas you likely qualify for — no sign-up needed.
        </p>

        <EligibilityChecker />

        <EmailCapture
          title="Full AI-powered analysis"
          subtitle="Get a personalized Plan A/B/C and readiness score by email."
        />

        <section className="mt-16">
          <h2 className="text-2xl font-semibold text-white">FAQ</h2>
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
