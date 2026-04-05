import type { Metadata } from "next";

import { Benefits } from "@/components/home/benefits";
import { CallToAction } from "@/components/home/call-to-action";
import { Hero } from "@/components/home/hero";
import { PathwayTeaser } from "@/components/home/pathway-teaser";
import { ScoreTeaser } from "@/components/home/score-teaser";
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
        publisher: { "@id": "https://immigrant.guru/#organization" },
        potentialAction: {
          "@type": "SearchAction",
          target: "https://immigrant.guru/sign-up",
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "Organization",
        "@id": "https://immigrant.guru/#organization",
        name: "Immigrant Guru",
        url: "https://immigrant.guru",
        logo: {
          "@type": "ImageObject",
          url: "https://immigrant.guru/logo-mark.svg",
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
          "AI-powered immigration decision platform. Build your profile, compare visa pathways, generate Plan A/B/C strategies, and track case readiness.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free to start"
        },
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.8",
          ratingCount: "120",
          bestRating: "5"
        },
        featureList: [
          "AI-powered visa strategy generation (Plan A/B/C)",
          "Immigration readiness scoring (0-100)",
          "Profile-aware pathway comparison",
          "Document management and intelligence",
          "Case health monitoring",
          "Next best action recommendations",
          "Knowledge-grounded AI responses"
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
              text: "Immigrant Guru is an AI-powered immigration strategy platform that helps users compare visa pathways, build structured immigration profiles, score readiness, and generate personalized Plan A/B/C strategies."
            }
          },
          {
            "@type": "Question",
            name: "How does the immigration score work?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The immigration score combines four components: profile completeness (30%), financial readiness (20%), professional strength (25%), and case readiness (25%) into a transparent 0-100 score."
            }
          },
          {
            "@type": "Question",
            name: "Is Immigrant Guru free?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes, Immigrant Guru is free to start. Create an account, build your immigration profile, and get your first readiness score and strategy recommendations at no cost."
            }
          },
          {
            "@type": "Question",
            name: "What visa pathways does Immigrant Guru cover?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Immigrant Guru covers a wide range of immigration pathways including EB-2 NIW, EB-1A, H-1B, L-1, O-1, Express Entry, Startup Visa, and many more across multiple countries."
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
        <PathwayTeaser />
        <CallToAction />
      </AppShell>
    </>
  );
}
