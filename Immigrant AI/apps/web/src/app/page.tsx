import type { Metadata } from "next";

import { AIStrategyShowcase } from "@/components/home/ai-strategy-showcase";
import { Benefits } from "@/components/home/benefits";
import { CallToAction } from "@/components/home/call-to-action";
import { FeatureGrid } from "@/components/home/feature-grid";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { ScoreTeaser } from "@/components/home/score-teaser";
import { StatsBar } from "@/components/home/stats-bar";
import { AppShell } from "@/components/layout/app-shell";
import { getPublicEnv } from "@/lib/config";

export const metadata: Metadata = {
  title: "Immigrant Guru - AI Immigration Strategy Platform",
  description:
    "Navigate immigration with clarity. Compare visa pathways, build your immigration profile, get AI-powered Plan A/B/C strategies, and score your readiness. Free to start.",
  alternates: {
    canonical: "https://immigrant.guru"
  },
  openGraph: {
    title: "Immigrant Guru - Navigate Immigration with Clarity",
    description:
      "AI-powered immigration strategy platform. Compare visa pathways, build your profile, score your readiness, and get personalized recommendations.",
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
        description:
          "AI-powered immigration strategy platform for visa pathway comparison, readiness scoring, and personalized action plans.",
        publisher: { "@id": "https://immigrant.guru/#organization" }
      },
      {
        "@type": "Organization",
        "@id": "https://immigrant.guru/#organization",
        name: "Immigrant Guru",
        url: "https://immigrant.guru",
        logo: {
          "@type": "ImageObject",
          url: "https://immigrant.guru/logo.png",
          width: 512,
          height: 512
        },
        sameAs: []
      },
      {
        "@type": "SoftwareApplication",
        name: "Immigrant Guru",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: "https://immigrant.guru",
        description:
          "AI-powered immigration decision platform with 47 visa categories, Plan A/B/C strategy generation, readiness scoring, document intelligence, and AI copilot.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free to start"
        },
        featureList: [
          "AI-powered visa strategy generation (Plan A/B/C)",
          "Immigration readiness scoring (0-100)",
          "47 US visa category analysis",
          "AI Copilot chat with source citations",
          "Scenario simulation (what-if modeling)",
          "Country comparison (side-by-side)",
          "Timeline projection with milestones",
          "Document intelligence and classification",
          "Knowledge base with 352 curated data points"
        ]
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is Immigrant Guru?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Immigrant Guru is an AI-powered immigration strategy platform that analyzes your profile against 47 visa categories, generates Plan A/B/C strategies, scores your readiness, and provides document intelligence."
            }
          },
          {
            "@type": "Question",
            name: "How does the immigration score work?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The score combines profile completeness (30%), professional strength (25%), case readiness (25%), and financial readiness (20%) into a transparent 0-100 score."
            }
          },
          {
            "@type": "Question",
            name: "Is Immigrant Guru free?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes, you can create an account, build your profile, get your readiness score, and create your first case for free."
            }
          },
          {
            "@type": "Question",
            name: "How many visa types does Immigrant Guru cover?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Immigrant Guru covers 47 US visa categories including EB-1A, EB-2 NIW, H-1B, L-1, O-1, EB-5, F-1, DV Lottery, and many more family and employment-based options."
            }
          }
        ]
      }
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default function HomePage() {
  const config = getPublicEnv();

  return (
    <>
      <JsonLd />
      <AppShell>
        <Hero config={config} />
        <Benefits />
        <ScoreTeaser />
        <AIStrategyShowcase />
        <FeatureGrid />
        <HowItWorks />
        <StatsBar />
        <CallToAction />
      </AppShell>
    </>
  );
}
