import type { Metadata } from "next";

import { CallToAction } from "@/components/home/call-to-action";
import { GlobalCoverage } from "@/components/home/global-coverage";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { InputStrip } from "@/components/home/input-strip";
import { PainSolution } from "@/components/home/pain-solution";
import { ResultsPreview } from "@/components/home/results-preview";
import { SocialProof } from "@/components/home/social-proof";
import { UseCases } from "@/components/home/use-cases";
import { AppShell } from "@/components/layout/app-shell";
import { getPublicEnv } from "@/lib/config";
import { buildAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Immigrant Guru - Move to a New Country Without Confusion",
  description:
    "Get your personalized visa, readiness score, and action plan in minutes. AI analyzes 47 visa categories to find your best path. Free to start.",
  alternates: buildAlternates("/"),
  openGraph: {
    title: "Immigrant Guru - Move to a New Country Without Confusion",
    description:
      "Get your personalized visa, readiness score, and action plan in minutes. Free to start.",
    url: "https://immigrant.guru"
  }
};

function JsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": "https://immigrant.guru/#website",
        url: "https://immigrant.guru",
        name: "Immigrant Guru",
        description: "AI-powered immigration strategy platform.",
        publisher: { "@id": "https://immigrant.guru/#organization" }
      },
      {
        "@type": "Organization",
        "@id": "https://immigrant.guru/#organization",
        name: "Immigrant Guru",
        url: "https://immigrant.guru",
        logo: { "@type": "ImageObject", url: "https://immigrant.guru/logo.png", width: 512, height: 512 }
      },
      {
        "@type": "SoftwareApplication",
        name: "Immigrant Guru",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: "https://immigrant.guru",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [
          "AI-powered visa strategy (Plan A/B/C)",
          "47 US visa category analysis",
          "Immigration readiness scoring (0-100)",
          "AI Copilot chat",
          "Scenario simulation",
          "Country comparison",
          "Document intelligence",
          "Timeline projection"
        ]
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is Immigrant Guru?",
            acceptedAnswer: { "@type": "Answer", text: "Immigrant Guru is an AI platform that finds your best visa path, scores your readiness, and gives you a step-by-step plan to move to another country." }
          },
          {
            "@type": "Question",
            name: "Is Immigrant Guru free?",
            acceptedAnswer: { "@type": "Answer", text: "Yes. Create an account, build your profile, and get your first plan for free. No credit card needed." }
          },
          {
            "@type": "Question",
            name: "How many visa types does it cover?",
            acceptedAnswer: { "@type": "Answer", text: "47 US visa categories including EB-1A, EB-2 NIW, H-1B, L-1, O-1, EB-5, F-1, DV Lottery, and more." }
          }
        ]
      }
    ]
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}

export default function HomePage() {
  const config = getPublicEnv();

  return (
    <>
      <JsonLd />
      <AppShell>
        <Hero config={config} />
        <InputStrip />
        <HowItWorks />
        <ResultsPreview />
        <PainSolution />
        <UseCases />
        <GlobalCoverage />
        <SocialProof />
        <CallToAction />
      </AppShell>
    </>
  );
}
