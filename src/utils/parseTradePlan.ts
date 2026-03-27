import type { TradePlan } from "../types";

const numberFromText = (value: string): number => Number(value.replace(/[, ]/g, "").trim());

const tfMinutes = (tf: TradePlan["timeframe"]): number => {
  if (tf === "1m") return 1;
  if (tf === "5m") return 5;
  if (tf === "15m") return 15;
  if (tf === "30m") return 30;
  if (tf === "1h") return 60;
  if (tf === "4h") return 240;
  return 1440;
};

const deriveValidUntilUtc = (timestampUtc: string, timeframe: TradePlan["timeframe"], bars: number): string => {
  const ts = new Date(timestampUtc).getTime();
  if (!Number.isFinite(ts)) return new Date(Date.now() + tfMinutes(timeframe) * bars * 60_000).toISOString();
  return new Date(ts + tfMinutes(timeframe) * bars * 60_000).toISOString();
};

const blockBetween = (text: string, start: string, ends: string[]): string => {
  const startRe = new RegExp(`${start}\\s*\\n`, "i");
  const startMatch = text.match(startRe);
  if (!startMatch || startMatch.index === undefined) return "";
  const from = startMatch.index + startMatch[0].length;
  const tail = text.slice(from);
  const endRe = new RegExp(`\\n(?:${ends.join("|")})\\s*\\n`, "i");
  const endMatch = tail.match(endRe);
  if (!endMatch || endMatch.index === undefined) return tail.trim();
  return tail.slice(0, endMatch.index).trim();
};

const parseStopsOrTargets = (block: string, kind: "SL" | "TP") => {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines
    .map((line) => {
      const re = new RegExp(`(${kind}[123]?)\\s*:\\s*([\\d,\\.]+)(?:\\s*Share\\s*%?\\s*(\\d+))?`, "i");
      const m = line.match(re);
      if (!m) return null;
      return {
        label: m[1].toUpperCase(),
        price: numberFromText(m[2]),
        sharePct: Number(m[3] ?? 0),
      };
    })
    .filter(Boolean) as Array<{ label: string; price: number; sharePct: number }>;
};

const toHorizon = (value?: string): TradePlan["horizon"] => {
  const v = (value ?? "").trim().toUpperCase();
  if (v === "SCALP") return "SCALP";
  if (v === "SWING") return "SWING";
  return "INTRADAY";
};

const toTimeframe = (value?: string): TradePlan["timeframe"] => {
  const v = (value ?? "").trim() as TradePlan["timeframe"];
  if (["1m", "5m", "15m", "30m", "1h", "4h", "1d"].includes(v)) return v;
  return "15m";
};

const isIso = (value: string) => !Number.isNaN(Date.parse(value));

const parseExecution = (text: string) => {
  const execBlock = blockBetween(text, "EXECUTION", ["ENTRY ZONE", "STOP LEVELS", "MARKET STATE", "FLOW ANALYSIS"]);
  const tradeValidity = (execBlock.match(/Trade Validity:\s*(VALID|WEAK|NO-TRADE)/i)?.[1]?.toUpperCase() ?? "") as TradePlan["tradeValidity"] | "";
  const entryWindow = (execBlock.match(/Entry Window:\s*(OPEN|NARROW|CLOSED)/i)?.[1]?.toUpperCase() ?? "") as TradePlan["entryWindow"] | "";
  const slippageRisk = (execBlock.match(/Slippage Risk:\s*(LOW|MED|HIGH)/i)?.[1]?.toUpperCase() ?? "") as TradePlan["slippageRisk"] | "";
  const triggersRaw = execBlock.match(/Triggers:\s*(.+)/i)?.[1]?.trim() ?? "";
  const invalidationRaw = execBlock.match(/Invalidation:\s*(.+)/i)?.[1]?.trim() ?? "";
  const timeLine = execBlock.match(/Time:\s*(.+)/i)?.[1]?.trim() ?? "";

  let timestampUtc = "";
  let validUntilBars = NaN;
  let validUntilUtc = "";
  const tm = timeLine.match(/([0-9TZ:\-\.]+)\s*\|\s*Valid\s*~?\s*(\d+)\s*bars?\s*\(until\s*([0-9TZ:\-\.]+)\)/i);
  if (tm) {
    timestampUtc = tm[1];
    validUntilBars = Number(tm[2]);
    validUntilUtc = tm[3];
  }

  return {
    tradeValidity,
    entryWindow,
    slippageRisk,
    triggersToActivate: triggersRaw
      ? triggersRaw.split(";").map((t) => t.trim()).filter(Boolean).slice(0, 2)
      : [],
    invalidation: invalidationRaw ? invalidationRaw.replace(/\n/g, " ").trim() : "",
    timestampUtc,
    validUntilBars,
    validUntilUtc,
  };
};

export const parseTradePlan = (text: string): TradePlan | null => {
  try {
    const symbol = text.match(/Symbol:\s*([A-Z0-9]+)/i)?.[1]?.toUpperCase();
    const direction = text.match(/Direction:\s*(LONG|SHORT)/i)?.[1]?.toUpperCase() as "LONG" | "SHORT" | undefined;
    const horizonRaw = text.match(/Horizon:\s*(SCALP|INTRADAY|SWING)/i)?.[1];
    const modeRaw = text.match(/Mode:\s*(Scalp|Intraday|Swing)/i)?.[1];
    const timeframeRaw = text.match(/Timeframe:\s*(1m|5m|15m|30m|1h|4h|1d)/i)?.[1];
    const setup = text.match(/Setup:\s*(.+)/i)?.[1]?.trim();
    const confidence = Number(text.match(/Confidence:\s*([0-9]*\.?[0-9]+)/i)?.[1]);

    const entryBlock = blockBetween(text, "ENTRY ZONE", ["STOP LEVELS", "TARGETS", "MARKET STATE", "FLOW ANALYSIS"]);
    const entryNums = entryBlock.match(/([\d,\.]+)\s*[–-]\s*([\d,\.]+)/);
    const entryType = text.match(/Entry Type:\s*(LIMIT|MARKET|STOP_LIMIT)/i)?.[1]?.toUpperCase() as TradePlan["entry"]["type"] | undefined;
    const entryTrigger = text.match(/Entry Trigger:\s*(.+)/i)?.[1]?.trim();

    const stopsBlock = blockBetween(text, "STOP LEVELS", ["TARGETS", "MARKET STATE", "FLOW ANALYSIS", "TRADE INTENT"]);
    const targetsBlock = blockBetween(text, "TARGETS", ["MARKET STATE", "FLOW ANALYSIS", "TRADE INTENT"]);
    const marketBlock = blockBetween(text, "MARKET STATE", ["FLOW ANALYSIS", "TRADE INTENT", "Always manage your own risk"]);
    const flowBlock = blockBetween(text, "FLOW ANALYSIS", ["TRADE INTENT", "Always manage your own risk"]);
    const intentBlock = blockBetween(text, "TRADE INTENT", ["Always manage your own risk"]);

    if (!symbol || !direction || !setup || Number.isNaN(confidence) || !entryNums) return null;

    const trend = marketBlock.match(/Trend:\s*(.+)/i)?.[1]?.trim() ?? "";
    const htfBias = marketBlock.match(/HTF Bias:\s*(.+)/i)?.[1]?.trim() ?? "";
    const volatility = marketBlock.match(/Volatility:\s*(.+)/i)?.[1]?.trim() ?? "";
    const execution = marketBlock.match(/Execution:\s*(.+)/i)?.[1]?.trim() ?? "";

    const flowAnalysis = flowBlock
      .split("\n")
      .map((line) => line.replace(/^[•\-]\s*/, "").trim())
      .filter(Boolean);
    const tradeIntent = intentBlock
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const now = new Date().toISOString();
    const horizon = toHorizon(horizonRaw ?? modeRaw);
    const timeframe = toTimeframe(timeframeRaw);
    const exec = parseExecution(text);

    let incomplete = false;
    let tradeValidity = exec.tradeValidity || "WEAK";
    let entryWindow = exec.entryWindow || "NARROW";
    let slippageRisk = exec.slippageRisk || "MED";
    let triggersToActivate = exec.triggersToActivate.slice(0, 2);
    let invalidation = exec.invalidation || "Invalidation not provided";
    let timestampUtc = exec.timestampUtc && isIso(exec.timestampUtc) ? exec.timestampUtc : now;
    let validUntilBars = Number.isFinite(exec.validUntilBars) && exec.validUntilBars > 0 ? exec.validUntilBars : 3;
    let validUntilUtc = exec.validUntilUtc && isIso(exec.validUntilUtc)
      ? exec.validUntilUtc
      : deriveValidUntilUtc(timestampUtc, timeframe, validUntilBars);

    const requiredExecMissing =
      !exec.tradeValidity ||
      !exec.entryWindow ||
      !exec.slippageRisk ||
      !exec.timestampUtc ||
      !isIso(exec.timestampUtc) ||
      !Number.isFinite(exec.validUntilBars) ||
      !timeframeRaw ||
      (!horizonRaw && !modeRaw);
    if (requiredExecMissing) {
      incomplete = true;
      tradeValidity = "WEAK";
      entryWindow = "NARROW";
      slippageRisk = "MED";
      triggersToActivate = ["Missing required execution fields"];
      invalidation = "Invalidation not provided";
      timestampUtc = now;
      validUntilBars = 3;
      validUntilUtc = deriveValidUntilUtc(timestampUtc, timeframe, validUntilBars);
    }

    invalidation = invalidation.replace(/\n/g, " ").trim();
    triggersToActivate = triggersToActivate.slice(0, 2);

    return {
      id: `tp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      symbol,
      direction,
      horizon,
      timeframe,
      setup,
      confidence,
      tradeValidity,
      entryWindow,
      slippageRisk,
      triggersToActivate,
      invalidation,
      timestampUtc,
      validUntilBars,
      validUntilUtc,
      entry: {
        low: numberFromText(entryNums[1]),
        high: numberFromText(entryNums[2]),
        raw: entryBlock,
        type: entryType,
        trigger: entryTrigger,
      },
      stops: parseStopsOrTargets(stopsBlock, "SL"),
      targets: parseStopsOrTargets(targetsBlock, "TP"),
      marketState: { trend, htfBias, volatility, execution },
      flowAnalysis,
      tradeIntent,
      disclaimer: "Always manage your own risk.",
      rawText: text,
      incomplete,
      status: "PENDING",
      result: "NONE",
      hitLevelType: null,
      hitLevelIndex: null,
      hitLevelPrice: null,
      minutesToEntry: null,
      minutesToExit: null,
      minutesTotal: null,
    };
  } catch {
    return null;
  }
};

export const formatTradePlan = (plan: TradePlan): string => {
  const stops = plan.stops.map((s) => `${s.label}: ${(s.price ?? 0).toLocaleString()}`).join("\n");
  const targets = plan.targets.map((t) => `${t.label}: ${(t.price ?? 0).toLocaleString()}`).join("\n");
  const flow = plan.flowAnalysis.map((f) => `• ${f}`).join("\n");
  const intent = plan.tradeIntent.join("\n");
  const triggers = plan.triggersToActivate.slice(0, 2).join("; ");
  return `BITRIUM AI TRADE PLAN
Symbol: ${plan.symbol}
Direction: ${plan.direction}
Horizon: ${plan.horizon}
Timeframe: ${plan.timeframe}
Setup: ${plan.setup}
Confidence: ${plan.confidence.toFixed(2)}

EXECUTION
Trade Validity: ${plan.tradeValidity}
Entry Window: ${plan.entryWindow}
Slippage Risk: ${plan.slippageRisk}
Triggers: ${triggers || "-"}
Invalidation: ${plan.invalidation}
Time: ${plan.timestampUtc} | Valid ~${plan.validUntilBars} bars (until ${plan.validUntilUtc})

ENTRY ZONE
${(plan.entry.low ?? 0).toLocaleString()} – ${(plan.entry.high ?? 0).toLocaleString()}

STOP LEVELS
${stops}

TARGETS
${targets}

MARKET STATE
Trend: ${plan.marketState.trend}
HTF Bias: ${plan.marketState.htfBias}
Volatility: ${plan.marketState.volatility}
Execution: ${plan.marketState.execution}

FLOW ANALYSIS
${flow}

TRADE INTENT
${intent}

${plan.disclaimer}`;
};
