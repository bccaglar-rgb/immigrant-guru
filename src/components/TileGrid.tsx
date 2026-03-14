import { useMemo } from "react";
import type { AiPanelData, FeedConfig, FlowSignalInputsConfig, FlowSignalWeightsConfig, TileState } from "../types";
import {
  FLOW_SIGNAL_ALIASES,
  FLOW_SIGNAL_DEFAULT_WEIGHTS,
  QUANT_LAYER_DEFINITIONS,
  TILE_LAYER_MAP,
  getFlowInputEnabled,
  type QuantLayerKey,
} from "../data/quantLayers";
import { TileCard } from "./TileCard";

interface Props {
  tiles: TileState[];
  feeds: FeedConfig;
  advanced: boolean;
  indicatorsEnabled: boolean;
  excludedKeys?: string[];
  flowSignalInputs?: FlowSignalInputsConfig;
  flowSignalWeights?: FlowSignalWeightsConfig;
  onFlowSignalInputsChange?: (next: FlowSignalInputsConfig) => void;
  onFlowSignalWeightChange?: (next: FlowSignalWeightsConfig) => void;
  layerScores?: AiPanelData["layerScores"];
}

interface LayerPanel {
  id: string;
  key: QuantLayerKey | "other";
  label: string;
  subtitle: string;
  priority: "P1" | "P2" | "P3";
  tone: {
    chip: string;
    border: string;
    bg: string;
  };
  tiles: TileState[];
}

const buttonTone = (active: boolean) =>
  `rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
    active
      ? "border-[#F5C542]/70 bg-[#2b2417] text-[#F5C542]"
      : "border-white/15 bg-[#111215] text-[#BFC2C7] hover:bg-[#17191d]"
  }`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const OTHER_PANEL_TONE: LayerPanel["tone"] = {
  chip: "border-[#5d6472] bg-[#1a202b] text-[#d5deed]",
  border: "border-[#5d6472]/35",
  bg: "bg-[linear-gradient(180deg,#111722_0%,#121316_100%)]",
};

const setFlowSignalState = (next: FlowSignalInputsConfig, key: string, value: boolean): void => {
  next[key] = value;
  const aliases = FLOW_SIGNAL_ALIASES[key] ?? [];
  for (const alias of aliases) next[alias] = value;
};

export const TileGrid = ({
  tiles,
  feeds,
  advanced,
  indicatorsEnabled,
  excludedKeys = [],
  flowSignalInputs,
  flowSignalWeights,
  onFlowSignalInputsChange,
  onFlowSignalWeightChange,
  layerScores,
}: Props) => {
  const hiddenKeys = new Set(excludedKeys);
  const visibleTiles = tiles.filter((tile) => {
    if (!(advanced || !tile.advanced)) return false;
    if (hiddenKeys.has(tile.key)) return false;
    if (tile.category === "Indicators" && tile.state === "OFF") return false;
    return true;
  });

  const panels = useMemo<LayerPanel[]>(() => {
    const built = QUANT_LAYER_DEFINITIONS
      .map<LayerPanel>((layer) => ({
        id: layer.key,
        key: layer.key,
        label: layer.label,
        subtitle: layer.subtitle,
        priority: layer.priority,
        tone: layer.tone,
        tiles: visibleTiles.filter((tile) => TILE_LAYER_MAP[tile.key] === layer.key),
      }))
      .filter((panel) => panel.tiles.length > 0);

    const mappedKeys = new Set(built.flatMap((panel) => panel.tiles.map((tile) => tile.key)));
    const otherTiles = visibleTiles.filter((tile) => !mappedKeys.has(tile.key));
    if (otherTiles.length) {
      built.push({
        id: "other",
        key: "other",
        label: "Additional Signals",
        subtitle: "Custom / Unmapped",
        priority: "P3",
        tone: OTHER_PANEL_TONE,
        tiles: otherTiles,
      });
    }
    return built;
  }, [visibleTiles]);

  return (
    <div className="space-y-3">
      {panels.map((panel, index) => {
        const panelSignalKeys = panel.tiles.map((tile) => tile.key);
        const uniquePanelSignalKeys = [...new Set(panelSignalKeys)];
        const panelAllOn =
          flowSignalInputs && uniquePanelSignalKeys.length
            ? uniquePanelSignalKeys.every((key) => getFlowInputEnabled(flowSignalInputs, key))
            : false;
        const panelSomeOff =
          flowSignalInputs && uniquePanelSignalKeys.length
            ? uniquePanelSignalKeys.some((key) => !getFlowInputEnabled(flowSignalInputs, key))
            : false;

        const panelScore = (() => {
          if (panel.key === "other") return undefined;
          if (flowSignalInputs && flowSignalWeights) {
            const activeTiles = panel.tiles.filter((tile) => getFlowInputEnabled(flowSignalInputs, tile.key));
            const totalWeight = activeTiles.reduce(
              (sum, tile) => sum + Math.max(1, Math.min(10, Math.round(Number(flowSignalWeights[tile.key] ?? FLOW_SIGNAL_DEFAULT_WEIGHTS[tile.key] ?? 3)))),
              0,
            );
            if (totalWeight <= 0) return 0;
            const totalScore = activeTiles.reduce(
              (sum, tile) =>
                sum +
                clamp(tile.confidence, 0, 100) *
                  Math.max(1, Math.min(10, Math.round(Number(flowSignalWeights[tile.key] ?? FLOW_SIGNAL_DEFAULT_WEIGHTS[tile.key] ?? 3)))),
              0,
            );
            return Math.round(totalScore / totalWeight);
          }
          if (layerScores && typeof layerScores[panel.key] === "number") {
            return Math.round(layerScores[panel.key] ?? 0);
          }
          return undefined;
        })();

        return (
          <section key={`${panel.id}-${index + 1}`} className={`rounded-2xl border p-3 ${panel.tone.border} ${panel.tone.bg}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-[#E7EAEE]">{panel.label}</h4>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${panel.tone.chip}`}>
                    Panel {index + 1}
                  </span>
                  <span className="text-[10px] text-[#6B6F76]">{panel.priority} Priority</span>
                  <span className="text-[10px] text-[#6B6F76]">{panel.subtitle}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-lg border border-white/10 bg-[#0E121A] px-2.5 py-1 text-right">
                  <div className="text-[9px] uppercase tracking-wider text-[#7E858F]">Score</div>
                  <div className="text-xs font-semibold text-[#F5C542]">{panelScore != null ? `${panelScore}%` : "N/A"}</div>
                </div>
                {flowSignalInputs && onFlowSignalInputsChange && uniquePanelSignalKeys.length ? (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className={buttonTone(panelAllOn)}
                      onClick={() => {
                        const next = { ...flowSignalInputs };
                        uniquePanelSignalKeys.forEach((key) => setFlowSignalState(next, key, true));
                        onFlowSignalInputsChange(next);
                      }}
                    >
                      All ON
                    </button>
                    <button
                      type="button"
                      className={buttonTone(panelSomeOff)}
                      onClick={() => {
                        const next = { ...flowSignalInputs };
                        uniquePanelSignalKeys.forEach((key) => setFlowSignalState(next, key, false));
                        onFlowSignalInputsChange(next);
                      }}
                    >
                      All OFF
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {panel.tiles.map((tile) => {
                const signalInput =
                  flowSignalInputs && onFlowSignalInputsChange
                    ? {
                        enabled: getFlowInputEnabled(flowSignalInputs, tile.key),
                        onToggle: (nextValue: boolean) => {
                          const next = { ...flowSignalInputs };
                          setFlowSignalState(next, tile.key, nextValue);
                          onFlowSignalInputsChange(next);
                        },
                      }
                    : undefined;
                const signalWeight =
                  flowSignalWeights && onFlowSignalWeightChange
                    ? {
                        value: Math.max(1, Math.min(10, Math.round(Number(flowSignalWeights[tile.key] ?? FLOW_SIGNAL_DEFAULT_WEIGHTS[tile.key] ?? 3)))),
                        onChange: (nextValue: number) => {
                          const next = { ...flowSignalWeights };
                          next[tile.key] = Math.max(1, Math.min(10, Math.round(nextValue)));
                          onFlowSignalWeightChange(next);
                        },
                      }
                    : undefined;
                return (
                  <TileCard
                    key={tile.key}
                    tile={tile}
                    feeds={feeds}
                    indicatorsEnabled={indicatorsEnabled}
                    signalInput={signalInput}
                    signalWeight={signalWeight}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};
