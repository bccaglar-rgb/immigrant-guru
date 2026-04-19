import type { MetadataRoute } from "next";

import { PROFILES } from "@/data/profiles";
import { COMPARISONS, buildMoveToPairs, buildVisaMatchPairs } from "@/data/seo-pairs";
import { VISAS } from "@/data/visa-catalog";

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
    },
    { url: `${SITE_URL}/visa`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/visa-match`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/move-to`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/best-countries`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/tools`, lastModified: now, changeFrequency: "weekly", priority: 0.8 }
  ];

  const visaRoutes: MetadataRoute.Sitemap = VISAS.map((v) => ({
    url: `${SITE_URL}/visa/${v.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8
  }));

  const bestCountriesRoutes: MetadataRoute.Sitemap = PROFILES.map((p) => ({
    url: `${SITE_URL}/best-countries/${p.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.75
  }));

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

  return [
    ...staticRoutes,
    ...visaRoutes,
    ...visaMatchRoutes,
    ...compareRoutes,
    ...moveToRoutes,
    ...bestCountriesRoutes
  ];
}
