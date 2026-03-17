import type { QuantSnapshot } from "./types.ts";

/** Normalize a tile state string to our typed values */
function normTernary(v: unknown, fallback: "LOW" | "MID" | "HIGH"): "LOW" | "MID" | "HIGH" {
  const s = String(v ?? "").toUpperCase();
  if (s === "LOW") return "LOW";
  if (s === "MID" || s === "MEDIUM" || s === "MODERATE") return "MID";
  if (s === "HIGH") return "HIGH";
  return fallback;
}

function normRegime(v: unknown): QuantSnapshot["regime"] {
  const s = String(v ?? "").toUpperCase();
  if (s === "TREND" || s === "TRENDING") return "TREND";
  if (s === "RANGE" || s === "RANGING") return "RANGE";
  if (s === "MIXED") return "MIXED";
  return "UNKNOWN";
}

function normTrend(v: unknown): QuantSnapshot["trendDirection"] {
  const s = String(v ?? "").toUpperCase();
  if (s === "UP" || s === "BULL" || s === "BULLISH") return "UP";
  if (s === "DOWN" || s === "BEAR" || s === "BEARISH") return "DOWN";
  return "NEUTRAL";
}

function normBias(v: unknown): QuantSnapshot["marketBias"] {
  const s = String(v ?? "").toUpperCase();
  if (s === "BULL" || s === "BULLISH") return "BULL";
  if (s === "BEAR" || s === "BEARISH") return "BEAR";
  return "MIXED";
}

function normFunding(v: unknown): QuantSnapshot["fundingBias"] {
  const s = String(v ?? "").toUpperCase();
  if (s === "BULLISH") return "BULLISH";
  if (s === "BEARISH") return "BEARISH";
  if (s === "EXTREME") return "EXTREME";
  return "NEUTRAL";
}

function normSpread(v: unknown): QuantSnapshot["spreadRegime"] {
  const s = String(v ?? "").toUpperCase();
  if (s === "TIGHT") return "TIGHT";
  if (s === "MID" || s === "MEDIUM" || s === "MODERATE") return "MID";
  return "WIDE";
}

/**
 * Build a QuantSnapshot from the raw market.ts API response body.
 * All fields are optional — we fall back gracefully.
 */
export function buildQuantSnapshotFromApiResponse(
  data: Record<string, unknown>,
  atrValue: number,
  closePrice: number,
): QuantSnapshot {
  // Extract tile states from snapshot_tiles array if present
  const tiles = Array.isArray(data.snapshot_tiles)
    ? (data.snapshot_tiles as Array<{ key: string; state?: string; value?: unknown }>)
    : [];
  const tileMap = new Map<string, string>(tiles.map((t) => [t.key, String(t.state ?? "")]));
  const tile = (key: string) => tileMap.get(key) ?? "";

  // Consensus engine fields (available in ai_panel.consensusEngine)
  const ce = (data.ai_panel as Record<string, unknown> | undefined)?.consensusEngine as Record<string, unknown> | undefined;
  const pWin = Number(ce?.pWin ?? 0);
  const expectedRR = Number(ce?.expectedRR ?? 0);
  const edgeNetR = Number(ce?.edgeNetR ?? 0);

  // finalScore from mode_scores of selected mode
  const scoringMode = String(data.scoring_mode ?? "BALANCED");
  const modeScores = data.mode_scores as Record<string, number> | undefined;
  const finalScore = Math.round((modeScores?.[scoringMode] ?? 0) * 100);

  return {
    regime: normRegime(tile("market-regime")),
    volatilityState: normTernary(tile("atr-regime"), "MID"),
    trendStrength: normTernary(tile("trend-strength"), "LOW"),
    trendDirection: normTrend(tile("trend-direction")),
    marketBias: normBias(tile("ema-alignment")),
    playbook: String((data.ai_panel as Record<string, unknown> | undefined)?.playbook ?? data.setup ?? ""),
    atrPct: closePrice > 0 ? atrValue / closePrice : 0,
    pWin: Number.isFinite(pWin) ? pWin : 0,
    expectedRR: Number.isFinite(expectedRR) ? expectedRR : 0,
    edgeNetR: Number.isFinite(edgeNetR) ? edgeNetR : 0,
    finalScore,
    liquidityDensity: normTernary(tile("liquidity-density"), "LOW"),
    spreadRegime: normSpread(tile("spread-regime")),
    cascadeRisk: normTernary(tile("cascade-risk"), "LOW"),
    marketStress: normTernary(tile("market-stress-level"), "LOW"),
    fundingBias: normFunding(tile("funding-bias")),
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Build a QuantSnapshot directly from individual tile values.
 * Used inside market.ts where the tile function and panel are directly available.
 */
export function buildQuantSnapshotDirect(params: {
  regime: string;
  volatilityState: string;
  trendStrength: string;
  trendDirection: string;
  marketBias: string;
  playbook: string;
  atrValue: number;
  closePrice: number;
  pWin: number;
  expectedRR: number;
  edgeNetR: number;
  finalScore: number;
  liquidityDensity: string;
  spreadRegime: string;
  cascadeRisk: string;
  marketStress: string;
  fundingBias: string;
}): QuantSnapshot {
  return {
    regime: normRegime(params.regime),
    volatilityState: normTernary(params.volatilityState, "MID"),
    trendStrength: normTernary(params.trendStrength, "LOW"),
    trendDirection: normTrend(params.trendDirection),
    marketBias: normBias(params.marketBias),
    playbook: params.playbook,
    atrPct: params.closePrice > 0 ? params.atrValue / params.closePrice : 0,
    pWin: Number.isFinite(params.pWin) ? params.pWin : 0,
    expectedRR: Number.isFinite(params.expectedRR) ? params.expectedRR : 0,
    edgeNetR: Number.isFinite(params.edgeNetR) ? params.edgeNetR : 0,
    finalScore: params.finalScore,
    liquidityDensity: normTernary(params.liquidityDensity, "LOW"),
    spreadRegime: normSpread(params.spreadRegime),
    cascadeRisk: normTernary(params.cascadeRisk, "LOW"),
    marketStress: normTernary(params.marketStress, "LOW"),
    fundingBias: normFunding(params.fundingBias),
    capturedAt: new Date().toISOString(),
  };
}
