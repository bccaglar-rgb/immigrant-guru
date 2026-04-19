export type ProfileArchetype = {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  strengths: string[];
  bestVisaSlugs: string[];
};

export const PROFILES: ProfileArchetype[] = [
  {
    slug: "software-engineer",
    title: "Software Engineer",
    shortTitle: "Software engineers",
    description: "Mid to senior software engineers, developers, and SREs with 3+ years of professional experience.",
    strengths: ["High-demand skill set", "Salary meets most visa thresholds", "Often eligible for talent-based paths"],
    bestVisaSlugs: ["h1b", "o1", "eb2-niw", "eu-blue-card", "highly-skilled-migrant", "critical-skills", "global-talent"]
  },
  {
    slug: "data-scientist",
    title: "Data Scientist",
    shortTitle: "Data scientists",
    description: "Data scientists, ML engineers, and applied researchers with strong publication or impact track record.",
    strengths: ["Research fit for talent visas", "High salaries", "Publication-backed evidence"],
    bestVisaSlugs: ["eb2-niw", "eb1a", "o1", "global-talent", "eu-blue-card"]
  },
  {
    slug: "doctor",
    title: "Physician",
    shortTitle: "Doctors",
    description: "Licensed physicians and specialists, including those interested in underserved-area pathways.",
    strengths: ["Regulated shortage profession", "Clear licensing frameworks"],
    bestVisaSlugs: ["eb2-niw", "h1b", "critical-skills", "skilled-worker"]
  },
  {
    slug: "nurse",
    title: "Registered Nurse",
    shortTitle: "Nurses",
    description: "Registered nurses, ICU, and specialty nurses with at least 2 years of clinical experience.",
    strengths: ["Shortage-list occupation worldwide", "Strong employer-sponsor demand"],
    bestVisaSlugs: ["eb3", "skilled-worker", "critical-skills", "skilled-independent-189"]
  },
  {
    slug: "entrepreneur",
    title: "Entrepreneur / Founder",
    shortTitle: "Entrepreneurs",
    description: "Founders with an operating business, traction, or venture backing.",
    strengths: ["Can qualify on impact, not formal degrees", "Multiple startup-specific paths"],
    bestVisaSlugs: ["canada-start-up-visa", "o1", "eb1a", "global-talent", "eb2-niw"]
  },
  {
    slug: "researcher",
    title: "Academic Researcher",
    shortTitle: "Researchers",
    description: "PhD holders, post-docs, and faculty with publications, citations, and peer-review credits.",
    strengths: ["Strong evidence for talent visas", "Peer-reviewed work", "Letters of recommendation"],
    bestVisaSlugs: ["eb1a", "eb2-niw", "o1", "global-talent"]
  },
  {
    slug: "finance-professional",
    title: "Finance Professional",
    shortTitle: "Finance professionals",
    description: "Investment bankers, quants, finance managers, and CFAs with a bachelor's or higher.",
    strengths: ["Meets salary thresholds easily", "Licensed-regulated paths"],
    bestVisaSlugs: ["h1b", "skilled-worker", "highly-skilled-migrant", "eu-blue-card"]
  },
  {
    slug: "student",
    title: "Student / Recent Graduate",
    shortTitle: "Students",
    description: "Prospective or recent graduates planning to study and work abroad.",
    strengths: ["Age-based points advantage", "Study-to-work transitions"],
    bestVisaSlugs: ["skilled-independent-189", "express-entry", "highly-skilled-migrant"]
  },
  {
    slug: "remote-worker",
    title: "Remote Worker",
    shortTitle: "Remote workers",
    description: "Location-independent professionals with stable income from a foreign employer or freelance.",
    strengths: ["Income-proof driven paths", "No employer sponsor needed"],
    bestVisaSlugs: ["d7", "express-entry"]
  },
  {
    slug: "investor",
    title: "Investor",
    shortTitle: "Investors",
    description: "Individuals willing to invest capital for residency pathways.",
    strengths: ["Capital-based qualification", "Fast processing in some countries"],
    bestVisaSlugs: ["d7", "canada-start-up-visa"]
  }
];

export const PROFILE_BY_SLUG: Record<string, ProfileArchetype> = Object.fromEntries(
  PROFILES.map((p) => [p.slug, p])
);

export function getProfile(slug: string): ProfileArchetype | null {
  return PROFILE_BY_SLUG[slug] ?? null;
}
