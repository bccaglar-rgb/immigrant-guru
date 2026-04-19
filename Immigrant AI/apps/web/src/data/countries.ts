export type Country = {
  slug: string;
  name: string;
  demonym: string;
  flag: string;
  region: "north-america" | "europe" | "asia" | "oceania" | "middle-east" | "latam" | "africa";
};

export const COUNTRIES: Country[] = [
  { slug: "usa", name: "United States", demonym: "American", flag: "🇺🇸", region: "north-america" },
  { slug: "canada", name: "Canada", demonym: "Canadian", flag: "🇨🇦", region: "north-america" },
  { slug: "uk", name: "United Kingdom", demonym: "British", flag: "🇬🇧", region: "europe" },
  { slug: "germany", name: "Germany", demonym: "German", flag: "🇩🇪", region: "europe" },
  { slug: "netherlands", name: "Netherlands", demonym: "Dutch", flag: "🇳🇱", region: "europe" },
  { slug: "ireland", name: "Ireland", demonym: "Irish", flag: "🇮🇪", region: "europe" },
  { slug: "portugal", name: "Portugal", demonym: "Portuguese", flag: "🇵🇹", region: "europe" },
  { slug: "spain", name: "Spain", demonym: "Spanish", flag: "🇪🇸", region: "europe" },
  { slug: "australia", name: "Australia", demonym: "Australian", flag: "🇦🇺", region: "oceania" },
  { slug: "new-zealand", name: "New Zealand", demonym: "New Zealander", flag: "🇳🇿", region: "oceania" },
  { slug: "turkey", name: "Turkey", demonym: "Turkish", flag: "🇹🇷", region: "middle-east" },
  { slug: "india", name: "India", demonym: "Indian", flag: "🇮🇳", region: "asia" },
  { slug: "brazil", name: "Brazil", demonym: "Brazilian", flag: "🇧🇷", region: "latam" },
  { slug: "mexico", name: "Mexico", demonym: "Mexican", flag: "🇲🇽", region: "latam" },
  { slug: "china", name: "China", demonym: "Chinese", flag: "🇨🇳", region: "asia" },
  { slug: "nigeria", name: "Nigeria", demonym: "Nigerian", flag: "🇳🇬", region: "africa" },
  { slug: "philippines", name: "Philippines", demonym: "Filipino", flag: "🇵🇭", region: "asia" },
  { slug: "pakistan", name: "Pakistan", demonym: "Pakistani", flag: "🇵🇰", region: "asia" },
  { slug: "iran", name: "Iran", demonym: "Iranian", flag: "🇮🇷", region: "middle-east" },
  { slug: "egypt", name: "Egypt", demonym: "Egyptian", flag: "🇪🇬", region: "africa" }
];

export const COUNTRY_BY_SLUG: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.slug, c])
);

export function getCountry(slug: string): Country | null {
  return COUNTRY_BY_SLUG[slug] ?? null;
}

export const DESTINATION_COUNTRIES = COUNTRIES.filter((c) =>
  ["usa", "canada", "uk", "germany", "netherlands", "ireland", "portugal", "spain", "australia", "new-zealand"].includes(c.slug)
);

export const SOURCE_COUNTRIES = COUNTRIES.filter((c) =>
  ["turkey", "india", "brazil", "mexico", "china", "nigeria", "philippines", "pakistan", "iran", "egypt"].includes(c.slug)
);
