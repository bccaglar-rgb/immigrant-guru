import type { MetadataRoute } from "next";

import { COMPARISONS, buildMoveToPairs, buildVisaMatchPairs } from "@/data/seo-pairs";

const SITE_URL = "https://immigrant.guru";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/sign-up`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/sign-in`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    {
      url: `${SITE_URL}/tools/eligibility-checker`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85
    },
    {
      url: `${SITE_URL}/tools/cost-estimator`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85
    },
    {
      url: `${SITE_URL}/tools/timeline-calculator`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85
    }
  ];

  const visaMatchRoutes: MetadataRoute.Sitemap = buildVisaMatchPairs().map((p) => ({
    url: `${SITE_URL}/visa-match/${p.destination}/${p.profile}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.75
  }));

  const compareRoutes: MetadataRoute.Sitemap = COMPARISONS.map((c) => ({
    url: `${SITE_URL}/compare/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7
  }));

  const moveToRoutes: MetadataRoute.Sitemap = buildMoveToPairs().map((p) => ({
    url: `${SITE_URL}/move-to/${p.from}/to/${p.to}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7
  }));

  return [...staticRoutes, ...visaMatchRoutes, ...compareRoutes, ...moveToRoutes];
}
