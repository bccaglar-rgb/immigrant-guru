import type { MetadataRoute } from "next";

import { PROFILES } from "@/data/profiles";
import { COMPARISONS, buildMoveToPairs, buildVisaMatchPairs } from "@/data/seo-pairs";
import { VISAS } from "@/data/visa-catalog";
import { routing } from "@/i18n/routing";

const SITE_URL = "https://immigrant.guru";

type SitemapEntry = MetadataRoute.Sitemap[number];

// Build a URL + its per-language alternates. `as-needed` localePrefix means
// English lives at bare `/path`, other locales at `/<locale>/path`. Google
// uses the `alternates.languages` field to pick the right variant per user.
function localizedEntry(path: string, opts: { changeFrequency?: SitemapEntry["changeFrequency"]; priority?: number }): SitemapEntry {
  const now = new Date();
  const languages: Record<string, string> = {};
  for (const code of routing.locales) {
    languages[code] = code === routing.defaultLocale
      ? `${SITE_URL}${path || "/"}`
      : `${SITE_URL}/${code}${path}`;
  }
  languages["x-default"] = `${SITE_URL}${path || "/"}`;

  return {
    url: `${SITE_URL}${path || "/"}`,
    lastModified: now,
    changeFrequency: opts.changeFrequency ?? "weekly",
    priority: opts.priority ?? 0.7,
    alternates: { languages }
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths: Array<{ path: string; priority: number; changeFrequency: SitemapEntry["changeFrequency"] }> = [
    { path: "", priority: 1.0, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
    { path: "/sign-up", priority: 0.8, changeFrequency: "monthly" },
    { path: "/sign-in", priority: 0.5, changeFrequency: "monthly" },
    { path: "/tools/eligibility-checker", priority: 0.85, changeFrequency: "weekly" },
    { path: "/tools/cost-estimator", priority: 0.85, changeFrequency: "weekly" },
    { path: "/tools/timeline-calculator", priority: 0.85, changeFrequency: "weekly" },
    { path: "/visa", priority: 0.8, changeFrequency: "weekly" },
    { path: "/visa-match", priority: 0.8, changeFrequency: "weekly" },
    { path: "/compare", priority: 0.8, changeFrequency: "weekly" },
    { path: "/move-to", priority: 0.8, changeFrequency: "weekly" },
    { path: "/best-countries", priority: 0.8, changeFrequency: "weekly" },
    { path: "/tools", priority: 0.8, changeFrequency: "weekly" }
  ];

  const staticRoutes: MetadataRoute.Sitemap = staticPaths.map((p) =>
    localizedEntry(p.path, { priority: p.priority, changeFrequency: p.changeFrequency })
  );

  const visaRoutes: MetadataRoute.Sitemap = VISAS.map((v) =>
    localizedEntry(`/visa/${v.slug}`, { priority: 0.8, changeFrequency: "weekly" })
  );

  const bestCountriesRoutes: MetadataRoute.Sitemap = PROFILES.map((p) =>
    localizedEntry(`/best-countries/${p.slug}`, { priority: 0.75, changeFrequency: "weekly" })
  );

  const visaMatchRoutes: MetadataRoute.Sitemap = buildVisaMatchPairs().map((p) =>
    localizedEntry(`/visa-match/${p.destination}/${p.profile}`, { priority: 0.75, changeFrequency: "weekly" })
  );

  const compareRoutes: MetadataRoute.Sitemap = COMPARISONS.map((c) =>
    localizedEntry(`/compare/${c.slug}`, { priority: 0.7, changeFrequency: "weekly" })
  );

  const moveToRoutes: MetadataRoute.Sitemap = buildMoveToPairs().map((p) =>
    localizedEntry(`/move-to/${p.from}/to/${p.to}`, { priority: 0.7, changeFrequency: "weekly" })
  );

  return [
    ...staticRoutes,
    ...visaRoutes,
    ...visaMatchRoutes,
    ...compareRoutes,
    ...moveToRoutes,
    ...bestCountriesRoutes
  ];
}
