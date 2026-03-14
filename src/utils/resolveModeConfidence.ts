import { ADMIN_CONFIG } from "../data/adminConfig";
import { MODE_EDITABILITY, type ModeKey } from "../data/modePolicy";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const normalizeConfidence01 = (value: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  const scaled = numeric > 1 ? numeric / 100 : numeric;
  return clamp(scaled, 0.4, 1.0);
};

type ModeConfidenceResolverInput = {
  minConfidence?: number;
};

type ResolveAdminInput = {
  minConfidence?: number;
  modeMinConfidence?: Partial<Record<ModeKey, number>>;
};

const resolveAdminValue = (mode: ModeKey, adminInput?: ResolveAdminInput): number => {
  const fallbackGlobal = ADMIN_CONFIG.tradeIdeas.minConfidenceGlobal;
  const globalValue = Number(adminInput?.minConfidence);
  const globalResolved = Number.isFinite(globalValue) ? normalizeConfidence01(globalValue) : fallbackGlobal;
  const rawMode = Number(adminInput?.modeMinConfidence?.[mode]);
  if (Number.isFinite(rawMode)) return normalizeConfidence01(rawMode);
  const defaultMode = Number(ADMIN_CONFIG.tradeIdeas.modeMinConfidence[mode]);
  if (Number.isFinite(defaultMode)) return normalizeConfidence01(defaultMode);
  return globalResolved;
};

export function resolveMinConfidence(
  mode: ModeKey,
  userSettings?: ModeConfidenceResolverInput,
  adminSettings?: ResolveAdminInput,
) {
  const adminValue = resolveAdminValue(mode, adminSettings);
  if (MODE_EDITABILITY[mode] === "USER") {
    const userValue = Number(userSettings?.minConfidence);
    return {
      value: Number.isFinite(userValue) ? normalizeConfidence01(userValue) : adminValue,
      source: "USER" as const,
    };
  }
  return {
    value: adminValue,
    source: "ADMIN" as const,
  };
}
