import type { CycleMetrics, GateResult, AiEvaluationResponse } from "./types.ts";

const P = "[AIEngineV2]";

export function logCycle(metrics: CycleMetrics): void {
  const { quantCandidates, afterGate, sentToAi, aiApproved, aiDowngraded, aiRejected, persisted, durationMs, errors } = metrics;
  console.log(
    `${P} Cycle done in ${durationMs}ms | quant=${quantCandidates} gate=${afterGate} ai=${sentToAi} ` +
    `approved=${aiApproved} downgraded=${aiDowngraded} rejected=${aiRejected} persisted=${persisted}` +
    (errors.length ? ` errors=[${errors.join(",")}]` : ""),
  );
}

export function logGateStats(gateResults: GateResult[]): void {
  const vetoed = gateResults.filter((g) => g.verdict === "VETO").length;
  const downgraded = gateResults.filter((g) => g.verdict === "DOWNGRADE").length;
  const passed = gateResults.filter((g) => g.verdict === "PASS").length;
  console.log(`${P} Gate: ${gateResults.length} candidates -> ${vetoed} vetoed, ${downgraded} downgraded, ${passed} passed`);
}

export function logAiStats(responses: AiEvaluationResponse[], latencyMs?: number): void {
  const approved = responses.filter((r) => r.verdict === "APPROVE").length;
  const downgraded = responses.filter((r) => r.verdict === "DOWNGRADE").length;
  const rejected = responses.filter((r) => r.verdict === "REJECT").length;
  const avgConf = responses.length > 0
    ? (responses.reduce((s, r) => s + r.confidence, 0) / responses.length).toFixed(1)
    : "N/A";
  console.log(
    `${P} AI: ${responses.length} evaluated -> ${approved} approve, ${downgraded} downgrade, ${rejected} reject` +
    ` | avg_confidence=${avgConf}` +
    (latencyMs != null ? ` | latency=${latencyMs}ms` : ""),
  );
}
