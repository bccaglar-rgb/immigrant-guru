import type { TradeIdeaRecord } from "../tradeIdeaTypes.ts";
import { pool } from "../../db/pool.ts";
import type { QuantSnapshot, SegmentKey } from "./types.ts";
import { buildSegmentKey } from "./types.ts";

export interface TradeWithSnapshot {
  trade: TradeIdeaRecord;
  snapshot: QuantSnapshot | null;
}

/** Fetch quant snapshots for a list of trade IDs from trade_idea_events */
async function fetchSnapshots(ideaIds: string[]): Promise<Map<string, QuantSnapshot>> {
  if (ideaIds.length === 0) return new Map();

  const placeholders = ideaIds.map((_, i) => `$${i + 1}`).join(",");
  const { rows } = await pool.query(
    `SELECT idea_id, meta FROM trade_idea_events
     WHERE idea_id IN (${placeholders}) AND event_type = 'QUANT_SNAPSHOT'
     ORDER BY ts ASC`,
    ideaIds,
  );

  const map = new Map<string, QuantSnapshot>();
  for (const row of rows) {
    if (!map.has(row.idea_id)) {
      // Take the first (earliest) snapshot per idea
      map.set(row.idea_id, row.meta as QuantSnapshot);
    }
  }
  return map;
}

/**
 * Group resolved trades by scoring mode and segment key.
 * Returns a nested map: mode → segmentKey → trades[]
 */
export async function groupTradesByModeAndSegment(
  trades: TradeIdeaRecord[],
): Promise<Map<string, Map<SegmentKey, TradeWithSnapshot[]>>> {
  const ids = trades.map((t) => t.id);
  const snapshots = await fetchSnapshots(ids);

  const result = new Map<string, Map<SegmentKey, TradeWithSnapshot[]>>();

  for (const trade of trades) {
    const snapshot = snapshots.get(trade.id) ?? null;
    const segment: SegmentKey = snapshot
      ? buildSegmentKey(snapshot)
      : "UNKNOWN_UNKNOWN";

    if (!result.has(trade.scoring_mode)) {
      result.set(trade.scoring_mode, new Map());
    }
    const modeMap = result.get(trade.scoring_mode)!;
    if (!modeMap.has(segment)) {
      modeMap.set(segment, []);
    }
    modeMap.get(segment)!.push({ trade, snapshot });
  }

  return result;
}

/** Group by mode only (ignoring segment) */
export function groupTradesByMode(
  trades: TradeIdeaRecord[],
): Map<string, TradeIdeaRecord[]> {
  const result = new Map<string, TradeIdeaRecord[]>();
  for (const trade of trades) {
    if (!result.has(trade.scoring_mode)) result.set(trade.scoring_mode, []);
    result.get(trade.scoring_mode)!.push(trade);
  }
  return result;
}

/** Classify current context into a segment key */
export function classifyCurrentContext(
  snapshot: Partial<QuantSnapshot>,
): SegmentKey {
  const regime = snapshot.regime ?? "UNKNOWN";
  const vol = snapshot.volatilityState ?? "MID";
  return buildSegmentKey({ regime, volatilityState: vol });
}
