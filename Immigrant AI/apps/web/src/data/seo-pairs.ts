import { DESTINATION_COUNTRIES, SOURCE_COUNTRIES } from "./countries";
import { PROFILES } from "./profiles";
import { VISAS } from "./visa-catalog";

export type VisaMatchPair = {
  destination: string;
  profile: string;
};

export type MoveToPair = {
  from: string;
  to: string;
};

export type ComparisonPair = {
  slug: string;
  visaA: string;
  visaB: string;
};

const PROFILE_DESTINATION_BLACKLIST: Record<string, string[]> = {
  "doctor": [],
  "remote-worker": ["usa"]
};

export function buildVisaMatchPairs(): VisaMatchPair[] {
  const pairs: VisaMatchPair[] = [];
  for (const dest of DESTINATION_COUNTRIES) {
    for (const profile of PROFILES) {
      const blocked = PROFILE_DESTINATION_BLACKLIST[profile.slug] ?? [];
      if (blocked.includes(dest.slug)) continue;
      pairs.push({ destination: dest.slug, profile: profile.slug });
    }
  }
  return pairs;
}

export function buildMoveToPairs(): MoveToPair[] {
  const pairs: MoveToPair[] = [];
  for (const source of SOURCE_COUNTRIES) {
    for (const dest of DESTINATION_COUNTRIES) {
      if (source.slug === dest.slug) continue;
      pairs.push({ from: source.slug, to: dest.slug });
    }
  }
  return pairs;
}

export const COMPARISONS: ComparisonPair[] = [
  { slug: "eb2-niw-vs-eb1a", visaA: "eb2-niw", visaB: "eb1a" },
  { slug: "eb2-niw-vs-o1", visaA: "eb2-niw", visaB: "o1" },
  { slug: "h1b-vs-o1", visaA: "h1b", visaB: "o1" },
  { slug: "h1b-vs-eb2-niw", visaA: "h1b", visaB: "eb2-niw" },
  { slug: "eb2-vs-eb3", visaA: "eb2-niw", visaB: "eb3" },
  { slug: "express-entry-vs-h1b", visaA: "express-entry", visaB: "h1b" },
  { slug: "express-entry-vs-skilled-worker", visaA: "express-entry", visaB: "skilled-worker" },
  { slug: "eu-blue-card-vs-highly-skilled-migrant", visaA: "eu-blue-card", visaB: "highly-skilled-migrant" },
  { slug: "global-talent-vs-o1", visaA: "global-talent", visaB: "o1" },
  { slug: "canada-start-up-visa-vs-o1", visaA: "canada-start-up-visa", visaB: "o1" },
  { slug: "d7-vs-highly-skilled-migrant", visaA: "d7", visaB: "highly-skilled-migrant" },
  { slug: "critical-skills-vs-skilled-worker", visaA: "critical-skills", visaB: "skilled-worker" }
];

export function getComparison(slug: string): ComparisonPair | null {
  return COMPARISONS.find((c) => c.slug === slug) ?? null;
}

export function topVisasForProfileDestination(profileSlug: string, destinationSlug: string) {
  const destVisas = VISAS.filter((v) => v.destination === destinationSlug);
  const profile = PROFILES.find((p) => p.slug === profileSlug);
  if (!profile) return destVisas.slice(0, 3);
  const preferred = destVisas.filter((v) => profile.bestVisaSlugs.includes(v.slug));
  if (preferred.length >= 3) return preferred.slice(0, 3);
  const extras = destVisas.filter((v) => !profile.bestVisaSlugs.includes(v.slug));
  return [...preferred, ...extras].slice(0, 3);
}
