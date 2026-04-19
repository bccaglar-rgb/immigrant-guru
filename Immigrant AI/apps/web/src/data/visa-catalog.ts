export type VisaCategory =
  | "work"
  | "investor"
  | "study"
  | "family"
  | "talent"
  | "digital-nomad"
  | "startup";

export type Visa = {
  slug: string;
  code: string;
  name: string;
  destination: string;
  category: VisaCategory;
  summary: string;
  idealFor: string[];
  typicalDuration: string;
  typicalCostUsd: { min: number; max: number };
  typicalTimelineMonths: { min: number; max: number };
  strengths: string[];
  risks: string[];
  requirements: string[];
  pathToPermanentResidency: boolean;
};

export const VISAS: Visa[] = [
  {
    slug: "eb2-niw",
    code: "EB-2 NIW",
    name: "EB-2 National Interest Waiver",
    destination: "usa",
    category: "talent",
    summary:
      "Self-petitioned US green card for advanced-degree holders or exceptional-ability professionals whose work serves the national interest.",
    idealFor: [
      "Researchers with published work",
      "Senior engineers with patents or impact metrics",
      "Entrepreneurs with proven ventures",
      "Physicians in underserved areas"
    ],
    typicalDuration: "Permanent residency",
    typicalCostUsd: { min: 5000, max: 15000 },
    typicalTimelineMonths: { min: 12, max: 36 },
    strengths: ["No employer sponsor required", "Leads directly to a green card", "Self-petition"],
    risks: [
      "Requires strong documentary evidence",
      "Retrogression for some countries of birth",
      "USCIS interpretations vary"
    ],
    requirements: [
      "Advanced degree or equivalent experience",
      "Evidence of national-interest impact",
      "Well-documented plan to continue work in the US"
    ],
    pathToPermanentResidency: true
  },
  {
    slug: "eb1a",
    code: "EB-1A",
    name: "EB-1A Extraordinary Ability",
    destination: "usa",
    category: "talent",
    summary:
      "Priority US green card for individuals at the very top of their field with sustained national or international acclaim.",
    idealFor: ["Top researchers", "Award-winning founders", "Recognized athletes and artists"],
    typicalDuration: "Permanent residency",
    typicalCostUsd: { min: 8000, max: 20000 },
    typicalTimelineMonths: { min: 10, max: 24 },
    strengths: ["No labor certification", "No employer sponsor", "Premium processing available"],
    risks: ["Very high evidentiary bar", "Subjective adjudication"],
    requirements: [
      "Meet at least 3 of 10 regulatory criteria",
      "Evidence of sustained acclaim",
      "Intent to continue work in the field"
    ],
    pathToPermanentResidency: true
  },
  {
    slug: "h1b",
    code: "H-1B",
    name: "H-1B Specialty Occupation",
    destination: "usa",
    category: "work",
    summary: "Employer-sponsored US work visa for specialty occupations requiring a bachelor's degree or higher.",
    idealFor: ["Software engineers", "Data scientists", "Finance professionals", "Healthcare specialists"],
    typicalDuration: "3 years (renewable to 6)",
    typicalCostUsd: { min: 4000, max: 8000 },
    typicalTimelineMonths: { min: 2, max: 8 },
    strengths: ["Dual intent", "Can lead to green card", "Established pathway"],
    risks: ["Annual cap lottery", "Employer-dependent", "Spouse work authorization limited"],
    requirements: ["Bachelor's degree or equivalent", "US employer sponsor", "Specialty occupation role"],
    pathToPermanentResidency: true
  },
  {
    slug: "o1",
    code: "O-1",
    name: "O-1 Extraordinary Ability",
    destination: "usa",
    category: "talent",
    summary:
      "US nonimmigrant visa for individuals with extraordinary ability in sciences, arts, education, business, or athletics.",
    idealFor: ["Accomplished founders", "Senior engineers with recognition", "Artists and performers"],
    typicalDuration: "3 years (renewable)",
    typicalCostUsd: { min: 6000, max: 15000 },
    typicalTimelineMonths: { min: 2, max: 6 },
    strengths: ["No cap or lottery", "Faster than green card", "Renewable indefinitely"],
    risks: ["Requires employer or agent sponsor", "Evidence bar is high"],
    requirements: ["Evidence of extraordinary ability", "Sponsor or agent", "Consultation from peer group"],
    pathToPermanentResidency: false
  },
  {
    slug: "eb3",
    code: "EB-3",
    name: "EB-3 Skilled Worker",
    destination: "usa",
    category: "work",
    summary: "US green card for skilled workers, professionals, and other workers with a permanent job offer.",
    idealFor: ["Skilled tradespeople", "Professionals with bachelor's degree", "Workers in shortage occupations"],
    typicalDuration: "Permanent residency",
    typicalCostUsd: { min: 6000, max: 12000 },
    typicalTimelineMonths: { min: 18, max: 60 },
    strengths: ["No exceptional-ability bar", "Broad eligibility"],
    risks: ["Requires PERM labor certification", "Long retrogression for some countries"],
    requirements: ["Permanent job offer", "PERM labor certification", "Bachelor's degree or 2+ years experience"],
    pathToPermanentResidency: true
  },
  {
    slug: "express-entry",
    code: "Express Entry",
    name: "Canada Express Entry",
    destination: "canada",
    category: "work",
    summary: "Points-based Canadian immigration system for skilled workers, evaluated via the Comprehensive Ranking System.",
    idealFor: ["Skilled workers under 40", "English or French speakers", "Those with Canadian work or study experience"],
    typicalDuration: "Permanent residency",
    typicalCostUsd: { min: 1500, max: 4000 },
    typicalTimelineMonths: { min: 6, max: 12 },
    strengths: ["Fast processing", "No employer required", "Direct PR"],
    risks: ["Competitive CRS scores", "Language test required"],
    requirements: ["Language test (IELTS/CELPIP/TEF)", "Educational Credential Assessment", "Work experience"],
    pathToPermanentResidency: true
  },
  {
    slug: "canada-start-up-visa",
    code: "SUV",
    name: "Canada Start-Up Visa",
    destination: "canada",
    category: "startup",
    summary: "Canadian PR program for entrepreneurs with a qualifying business backed by a designated organization.",
    idealFor: ["Startup founders", "Tech entrepreneurs", "Teams with scalable ventures"],
    typicalDuration: "Permanent residency",
    typicalCostUsd: { min: 3000, max: 10000 },
    typicalTimelineMonths: { min: 12, max: 24 },
    strengths: ["Direct PR", "No investment minimum from founder"],
    risks: ["Designated-org endorsement required", "Letter-of-support shopping"],
    requirements: ["Qualifying business", "Letter of support", "Language proficiency", "Settlement funds"],
    pathToPermanentResidency: true
  },
  {
    slug: "skilled-worker",
    code: "Skilled Worker",
    name: "UK Skilled Worker Visa",
    destination: "uk",
    category: "work",
    summary: "UK work visa for skilled professionals with a job offer from a licensed sponsor.",
    idealFor: ["Tech workers", "Healthcare professionals", "Finance professionals"],
    typicalDuration: "5 years (route to ILR)",
    typicalCostUsd: { min: 1500, max: 5000 },
    typicalTimelineMonths: { min: 2, max: 4 },
    strengths: ["5-year route to settlement", "Dependents allowed"],
    risks: ["Sponsor-dependent", "Minimum salary threshold"],
    requirements: ["Sponsor license employer", "Job offer meeting salary threshold", "English proficiency"],
    pathToPermanentResidency: true
  },
  {
    slug: "global-talent",
    code: "Global Talent",
    name: "UK Global Talent Visa",
    destination: "uk",
    category: "talent",
    summary: "UK visa for leaders or potential leaders in academia, arts, or digital technology — no job offer required.",
    idealFor: ["Tech leads with open-source impact", "Researchers", "Creative professionals"],
    typicalDuration: "5 years (route to ILR)",
    typicalCostUsd: { min: 1000, max: 3000 },
    typicalTimelineMonths: { min: 2, max: 6 },
    strengths: ["No sponsor needed", "Self-employed allowed"],
    risks: ["Endorsement required", "Subjective review"],
    requirements: ["Endorsement from approved body", "Evidence of talent or promise"],
    pathToPermanentResidency: true
  },
  {
    slug: "eu-blue-card",
    code: "EU Blue Card",
    name: "Germany EU Blue Card",
    destination: "germany",
    category: "work",
    summary: "Germany's fast-track work and residence permit for highly qualified non-EU professionals.",
    idealFor: ["Tech workers", "Engineers", "STEM professionals"],
    typicalDuration: "4 years (route to PR)",
    typicalCostUsd: { min: 500, max: 2000 },
    typicalTimelineMonths: { min: 1, max: 3 },
    strengths: ["Fast PR in 21–33 months", "Family reunification"],
    risks: ["Salary threshold", "Recognized-degree requirement"],
    requirements: ["Recognized university degree", "Qualifying job offer", "Minimum salary threshold"],
    pathToPermanentResidency: true
  },
  {
    slug: "highly-skilled-migrant",
    code: "HSM",
    name: "Netherlands Highly Skilled Migrant",
    destination: "netherlands",
    category: "work",
    summary: "Dutch residence permit for highly skilled foreign workers sponsored by a recognized employer.",
    idealFor: ["Tech professionals", "Finance professionals", "Recent graduates earning above threshold"],
    typicalDuration: "5 years (route to PR)",
    typicalCostUsd: { min: 500, max: 2000 },
    typicalTimelineMonths: { min: 1, max: 3 },
    strengths: ["Fast decision", "30% ruling tax benefit", "Family friendly"],
    risks: ["Must be sponsored by IND-recognized employer"],
    requirements: ["Recognized sponsor employer", "Minimum gross salary", "Employment contract"],
    pathToPermanentResidency: true
  },
  {
    slug: "skilled-independent-189",
    code: "189",
    name: "Australia Skilled Independent Visa (189)",
    destination: "australia",
    category: "work",
    summary: "Australian points-tested permanent visa for skilled workers — no sponsor required.",
    idealFor: ["Skilled workers under 45", "Workers in occupation lists"],
    typicalDuration: "Permanent residency",
    typicalCostUsd: { min: 3000, max: 7000 },
    typicalTimelineMonths: { min: 8, max: 18 },
    strengths: ["Direct PR", "No sponsor needed"],
    risks: ["Points threshold is competitive", "Occupation list changes"],
    requirements: ["Skills assessment", "Points >= threshold", "English proficiency"],
    pathToPermanentResidency: true
  },
  {
    slug: "critical-skills",
    code: "Critical Skills",
    name: "Ireland Critical Skills Employment Permit",
    destination: "ireland",
    category: "work",
    summary: "Ireland's fast-track work permit for occupations on the critical skills list.",
    idealFor: ["Software engineers", "ICT professionals", "Medical professionals"],
    typicalDuration: "2 years (route to Stamp 4)",
    typicalCostUsd: { min: 1000, max: 3000 },
    typicalTimelineMonths: { min: 2, max: 4 },
    strengths: ["Fast PR route after 2 years", "Immediate family reunification"],
    risks: ["Job must be on critical skills list", "Salary threshold"],
    requirements: ["Qualifying job offer", "Salary >= threshold", "Relevant qualifications"],
    pathToPermanentResidency: true
  },
  {
    slug: "d7",
    code: "D7",
    name: "Portugal D7 Passive Income Visa",
    destination: "portugal",
    category: "investor",
    summary: "Portuguese residence visa for applicants with stable passive or remote income.",
    idealFor: ["Retirees", "Remote workers", "Passive-income earners"],
    typicalDuration: "2 years (renewable, route to PR)",
    typicalCostUsd: { min: 2000, max: 5000 },
    typicalTimelineMonths: { min: 4, max: 8 },
    strengths: ["Low income threshold", "Schengen access", "5-year route to citizenship"],
    risks: ["Must demonstrate stable income", "Tax residency shifts"],
    requirements: ["Proof of passive/remote income", "Accommodation in Portugal", "Tax ID"],
    pathToPermanentResidency: true
  }
];

export const VISA_BY_SLUG: Record<string, Visa> = Object.fromEntries(VISAS.map((v) => [v.slug, v]));

export function getVisa(slug: string): Visa | null {
  return VISA_BY_SLUG[slug] ?? null;
}

export function visasByDestination(destinationSlug: string): Visa[] {
  return VISAS.filter((v) => v.destination === destinationSlug);
}
