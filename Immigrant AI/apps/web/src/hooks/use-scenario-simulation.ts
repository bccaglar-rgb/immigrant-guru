"use client";

import { useState } from "react";

import { simulateScenario } from "@/lib/scenario-simulation";
import type {
  ScenarioSimulationInputs,
  ScenarioSimulationState
} from "@/types/scenario-simulation";

type ScenarioField = keyof ScenarioSimulationInputs;

export function useScenarioSimulation(
  baseline: ScenarioSimulationInputs
) {
  const [current, setCurrent] = useState<ScenarioSimulationInputs>(baseline);

  const state: ScenarioSimulationState = {
    baseline,
    current,
    result: simulateScenario(baseline, current)
  };

  function updateField<K extends ScenarioField>(
    field: K,
    value: ScenarioSimulationInputs[K]
  ) {
    setCurrent((previous) => ({
      ...previous,
      [field]: value
    }));
  }

  function reset() {
    setCurrent(baseline);
  }

  return {
    ...state,
    reset,
    updateField
  };
}
