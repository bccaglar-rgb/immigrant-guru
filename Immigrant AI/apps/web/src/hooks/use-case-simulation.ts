"use client";

import { useEffect, useRef, useState } from "react";

import {
  buildCaseSimulationInputs,
  simulateCaseScenario
} from "@/lib/simulation-client";
import type {
  CaseSimulationInputs,
  CaseSimulationResponse
} from "@/types/case-simulation";

type UseCaseSimulationOptions = {
  accessToken: string;
  baseline: CaseSimulationInputs;
  caseId: string;
  enabled?: boolean;
  onUnauthorized?: () => void;
};

export function useCaseSimulation({
  accessToken,
  baseline,
  caseId,
  enabled = true,
  onUnauthorized
}: UseCaseSimulationOptions) {
  const [inputs, setInputs] = useState<CaseSimulationInputs>(baseline);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<CaseSimulationResponse | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setInputs(buildCaseSimulationInputs(baseline));
  }, [baseline]);

  useEffect(() => {
    if (!enabled || !accessToken) {
      setIsLoading(false);
      setError(null);
      return;
    }

    let isActive = true;

    async function runSimulation() {
      setIsLoading(true);
      setError(null);

      const response = await simulateCaseScenario(accessToken, caseId, inputs);
      if (!isActive) {
        return;
      }

      if (!response.ok) {
        if (response.status === 401) {
          onUnauthorized?.();
        }
        setResult(null);
        setError(response.errorMessage);
        setIsLoading(false);
        return;
      }

      setResult(response.data);
      setError(null);
      setIsLoading(false);
    }

    timeoutRef.current = window.setTimeout(() => {
      void runSimulation();
    }, 250);

    return () => {
      isActive = false;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [accessToken, caseId, enabled, inputs, onUnauthorized]);

  function updateField<K extends keyof CaseSimulationInputs>(
    field: K,
    value: CaseSimulationInputs[K]
  ) {
    setInputs((current) => ({
      ...current,
      [field]: value
    }));
  }

  function reset() {
    setInputs(buildCaseSimulationInputs(baseline));
  }

  return {
    error,
    inputs,
    isLoading,
    reset,
    result,
    updateField
  };
}
