import {
  englishLevelOptions,
  type EducationLevel,
  type EnglishLevel
} from "@/types/profile";
import type {
  ScenarioImpactSummaryItem,
  ScenarioRecommendation,
  ScenarioSimulationInputs,
  ScenarioSimulationResult
} from "@/types/scenario-simulation";

const englishWeights: Record<EnglishLevel, number> = {
  advanced: 18,
  basic: 6,
  fluent: 22,
  intermediate: 12,
  native: 24,
  none: 0
};

const educationWeights: Record<EducationLevel, number> = {
  associate: 11,
  bachelor: 17,
  doctorate: 24,
  high_school: 5,
  master: 21,
  other: 9,
  vocational: 8
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function scoreCapital(capital: number) {
  if (capital >= 200000) {
    return 20;
  }
  if (capital >= 120000) {
    return 17;
  }
  if (capital >= 70000) {
    return 13;
  }
  if (capital >= 35000) {
    return 9;
  }
  if (capital >= 15000) {
    return 5;
  }
  return 2;
}

function scoreExperience(years: number) {
  if (years >= 10) {
    return 22;
  }
  if (years >= 7) {
    return 19;
  }
  if (years >= 5) {
    return 15;
  }
  if (years >= 3) {
    return 11;
  }
  if (years >= 1) {
    return 7;
  }
  return 3;
}

function scoreSynergy(input: ScenarioSimulationInputs) {
  let total = 0;

  if (
    (input.educationLevel === "bachelor" ||
      input.educationLevel === "master" ||
      input.educationLevel === "doctorate") &&
    (input.englishLevel === "advanced" ||
      input.englishLevel === "fluent" ||
      input.englishLevel === "native")
  ) {
    total += 4;
  }

  if (input.yearsOfExperience >= 5) {
    total += 3;
  }

  if (input.availableCapital >= 70000) {
    total += 3;
  }

  return total;
}

export function calculateScenarioProbability(input: ScenarioSimulationInputs) {
  const score =
    englishWeights[input.englishLevel] +
    educationWeights[input.educationLevel] +
    scoreCapital(input.availableCapital) +
    scoreExperience(input.yearsOfExperience) +
    scoreSynergy(input);

  return roundToSingleDecimal(clamp(score, 0, 100));
}

export function calculateScenarioTimeline(input: ScenarioSimulationInputs) {
  let months = 20;

  months -= englishWeights[input.englishLevel] / 5;
  months -= educationWeights[input.educationLevel] / 6;
  months -= scoreExperience(input.yearsOfExperience) / 7;
  months -= scoreCapital(input.availableCapital) / 10;

  if (input.availableCapital < 25000) {
    months += 1.8;
  }

  if (input.englishLevel === "none" || input.englishLevel === "basic") {
    months += 2.4;
  }

  return roundToSingleDecimal(clamp(months, 6, 30));
}

function getEnglishLabel(level: EnglishLevel) {
  return (
    englishLevelOptions.find((option) => option.value === level)?.label ?? level
  );
}

function buildImpactSummary(
  baseline: ScenarioSimulationInputs,
  current: ScenarioSimulationInputs,
  probabilityChange: number,
  timelineChange: number
) {
  const items: ScenarioImpactSummaryItem[] = [];

  if (probabilityChange >= 8) {
    items.push({
      id: "probability-up",
      summary:
        "This scenario materially strengthens pathway competitiveness and improves the planning outlook.",
      tone: "positive"
    });
  } else if (probabilityChange <= -8) {
    items.push({
      id: "probability-down",
      summary:
        "This scenario would likely weaken case positioning and should be treated as a downside path to avoid.",
      tone: "negative"
    });
  } else {
    items.push({
      id: "probability-flat",
      summary:
        "This scenario changes the case direction only modestly, so supporting evidence quality would still matter most.",
      tone: "neutral"
    });
  }

  if (timelineChange <= -1.5) {
    items.push({
      id: "timeline-faster",
      summary:
        "The timeline becomes meaningfully shorter because preparation friction is reduced earlier in the case.",
      tone: "positive"
    });
  } else if (timelineChange >= 1.5) {
    items.push({
      id: "timeline-slower",
      summary:
        "The timeline becomes longer, which suggests additional preparation or evidence-building before execution.",
      tone: "negative"
    });
  }

  if (current.englishLevel !== baseline.englishLevel) {
    items.push({
      id: "english-shift",
      summary: `English moving to ${getEnglishLabel(current.englishLevel)} changes both credibility and case speed.`,
      tone:
        englishWeights[current.englishLevel] >= englishWeights[baseline.englishLevel]
          ? "positive"
          : "negative"
    });
  }

  if (current.availableCapital !== baseline.availableCapital) {
    items.push({
      id: "capital-shift",
      summary:
        current.availableCapital > baseline.availableCapital
          ? "Additional capital improves flexibility for evidence, filing readiness, and fallback options."
          : "Lower capital reduces execution flexibility and can introduce more document and timing pressure.",
      tone:
        current.availableCapital > baseline.availableCapital
          ? "positive"
          : "negative"
    });
  }

  return items.slice(0, 4);
}

function buildRecommendedImprovements(
  current: ScenarioSimulationInputs
): ScenarioRecommendation[] {
  const recommendations: ScenarioRecommendation[] = [];

  if (englishWeights[current.englishLevel] < englishWeights.advanced) {
    recommendations.push({
      id: "english",
      title: "Raise English evidence strength",
      detail:
        "Improving English results is usually one of the fastest ways to increase competitiveness and reduce timeline drag.",
      impactLabel: "High impact"
    });
  }

  if (current.availableCapital < 70000) {
    recommendations.push({
      id: "capital",
      title: "Increase liquid capital readiness",
      detail:
        "A stronger capital buffer improves execution flexibility for filing, translations, credentials, and contingency planning.",
      impactLabel: "Medium impact"
    });
  }

  if (
    current.educationLevel === "high_school" ||
    current.educationLevel === "vocational" ||
    current.educationLevel === "associate"
  ) {
    recommendations.push({
      id: "education",
      title: "Strengthen education positioning",
      detail:
        "Credential evaluation, degree equivalency, or an additional qualification can noticeably improve pathway fit.",
      impactLabel: "High impact"
    });
  }

  if (current.yearsOfExperience < 5) {
    recommendations.push({
      id: "experience",
      title: "Build stronger experience evidence",
      detail:
        "Longer, better-documented experience often improves both suitability and confidence for skilled routes.",
      impactLabel: "Foundational"
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "evidence-quality",
      title: "Focus on document quality and evidence clarity",
      detail:
        "The profile inputs are already strong, so the next lift usually comes from cleaner documentation and pathway-specific evidence.",
      impactLabel: "Foundational"
    });
  }

  return recommendations.slice(0, 3);
}

export function simulateScenario(
  baseline: ScenarioSimulationInputs,
  current: ScenarioSimulationInputs
): ScenarioSimulationResult {
  const baselineProbability = calculateScenarioProbability(baseline);
  const currentProbability = calculateScenarioProbability(current);
  const baselineTimeline = calculateScenarioTimeline(baseline);
  const currentTimeline = calculateScenarioTimeline(current);

  return {
    impactSummary: buildImpactSummary(
      baseline,
      current,
      roundToSingleDecimal(currentProbability - baselineProbability),
      roundToSingleDecimal(currentTimeline - baselineTimeline)
    ),
    probability: {
      after: currentProbability,
      before: baselineProbability,
      change: roundToSingleDecimal(currentProbability - baselineProbability),
      label: "Probability outlook"
    },
    recommendedImprovements: buildRecommendedImprovements(current),
    timeline: {
      after: currentTimeline,
      before: baselineTimeline,
      change: roundToSingleDecimal(currentTimeline - baselineTimeline),
      label: "Estimated timeline"
    }
  };
}

export const scenarioSimulationMockBaseline: ScenarioSimulationInputs = {
  availableCapital: 45000,
  educationLevel: "bachelor",
  englishLevel: "intermediate",
  yearsOfExperience: 4
};
