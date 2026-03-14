import test from "node:test";
import assert from "node:assert/strict";
import { computeScore, SCORING_CONFIG } from "../src/data/scoringEngine.ts";

test("shared modes keep Capital Guard as the strictest profile for same market snapshot", () => {
  const input = {
    edgeNetR: 0.08,
    pFill: 0.55,
    capacity: 0.6,
    inputModifier: 0.9,
    stress: 0.65,
    shock: 0.7,
    chop: 0.55,
    crowding: 0.6,
    penaltyPoints: 20,
    momentum: 0.72,
    volumeSpike: 0.68,
    liquiditySweep: 0.64,
  };

  const aggressive = computeScore({ mode: "AGGRESSIVE", ...input });
  const balanced = computeScore({ mode: "BALANCED", ...input });
  const capitalGuard = computeScore({ mode: "CAPITAL_GUARD", ...input });

  assert.ok(Math.max(aggressive.finalScore, balanced.finalScore) > capitalGuard.finalScore);
});

test("gates keep real computed score and expose flags", () => {
  const result = computeScore({
    mode: "BALANCED",
    edgeNetR: 0.25,
    pFill: 0.3,
    capacity: 0.2,
    inputModifier: 1,
    stress: 0.2,
    shock: 0.2,
    chop: 0.2,
    crowding: 0.2,
    penaltyPoints: 10,
  });

  assert.ok(result.finalScore > SCORING_CONFIG.BALANCED.minFloor);
  assert.ok(result.gatingFlags.includes("LOW_FILL_PROB"));
  assert.ok(result.gatingFlags.includes("LOW_CAPACITY"));
});
