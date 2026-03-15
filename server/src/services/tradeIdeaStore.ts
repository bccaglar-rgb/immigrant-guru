import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TradeIdeaEventRecord, TradeIdeaRecord, TradeIdeaStatus, TradeIdeaStorageModel } from "./tradeIdeaTypes.ts";
import { normalizeScoringMode, SCORING_MODES, type ScoringMode } from "./scoringMode.ts";

const defaultStorage = (): TradeIdeaStorageModel => ({
  ideas: [],
  events: [],
});

export class TradeIdeaStore {
  private loaded = false;

  private state: TradeIdeaStorageModel = defaultStorage();

  private writeChain: Promise<void> = Promise.resolve();

  private readonly filePath: string;

  constructor(filePath = path.join(process.cwd(), "server", "data", "trade_ideas.json")) {
    this.filePath = filePath;
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as TradeIdeaStorageModel;
      let migratedLegacyStatuses = false;
      this.state = {
        ideas: Array.isArray(parsed?.ideas)
          ? parsed.ideas.map((idea) => {
              const approvedModesRaw = Array.isArray(idea?.approved_modes) ? idea.approved_modes : [];
              const approvedModes = approvedModesRaw
                .map((mode) => normalizeScoringMode(mode, "BALANCED"))
                .filter((mode, index, arr) => arr.indexOf(mode) === index);
              const modeScoresRaw = idea?.mode_scores && typeof idea.mode_scores === "object"
                ? (idea.mode_scores as Partial<Record<ScoringMode, unknown>>)
                : {};
              const modeScores: Partial<Record<ScoringMode, number>> = {};
              for (const key of SCORING_MODES) {
                const value = modeScoresRaw[key];
                const numeric = typeof value === "number" ? value : Number(value);
                if (Number.isFinite(numeric)) {
                  const ratio = numeric > 1 ? numeric / 100 : numeric;
                  modeScores[key] = Math.max(0, Math.min(1, ratio));
                }
              }
              const scoringMode = normalizeScoringMode(idea?.scoring_mode);
              if (!approvedModes.length) approvedModes.push(scoringMode);
              const legacyExpired = idea?.status === "EXPIRED";
              if (legacyExpired) migratedLegacyStatuses = true;
              const normalizedStatus = legacyExpired ? "RESOLVED" : idea?.status;
              const normalizedResult = legacyExpired && idea?.result === "NONE" ? "FAIL" : idea?.result;
              return {
                ...idea,
                scoring_mode: scoringMode,
                approved_modes: approvedModes,
                mode_scores: modeScores,
                status: normalizedStatus,
                result: normalizedResult,
              };
            })
          : [],
        events: Array.isArray(parsed?.events) ? parsed.events : [],
      };
      if (migratedLegacyStatuses) {
        await this.flush();
      }
    } catch {
      this.state = defaultStorage();
      await this.flush();
    } finally {
      this.loaded = true;
    }
  }

  private async flush() {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    this.writeChain = this.writeChain
      .catch(() => {
        // Recover write chain after transient fs errors.
      })
      .then(async () => {
        const payload = JSON.stringify(this.state, null, 2);
        await writeFile(this.filePath, payload, "utf8");
      });
    await this.writeChain;
  }

  async createIdea(idea: TradeIdeaRecord, initialPrice: number) {
    await this.ensureLoaded();
    this.state.ideas.unshift(idea);
    this.state.events.push({
      id: randomUUID(),
      idea_id: idea.id,
      event_type: "IDEA_CREATED",
      ts: idea.created_at,
      price: initialPrice,
      meta: {
        symbol: idea.symbol,
        direction: idea.direction,
        entry_low: idea.entry_low,
        entry_high: idea.entry_high,
      },
    });
    await this.flush();
    return idea;
  }

  async appendEvent(event: Omit<TradeIdeaEventRecord, "id">) {
    await this.ensureLoaded();
    this.state.events.push({
      id: randomUUID(),
      ...event,
    });
    await this.flush();
  }

  async updateIdea(id: string, patch: Partial<TradeIdeaRecord>) {
    await this.ensureLoaded();
    const idx = this.state.ideas.findIndex((idea) => idea.id === id);
    if (idx < 0) return null;
    const next = { ...this.state.ideas[idx], ...patch };
    this.state.ideas[idx] = next;
    await this.flush();
    return next;
  }

  async getIdea(id: string) {
    await this.ensureLoaded();
    return this.state.ideas.find((idea) => idea.id === id) ?? null;
  }

  async listIdeas(params?: {
    userId?: string;
    statuses?: TradeIdeaStatus[];
    symbol?: string;
    scoringMode?: ScoringMode;
    limit?: number;
  }) {
    await this.ensureLoaded();
    const statuses = params?.statuses?.length ? new Set(params.statuses) : null;
    const symbol = params?.symbol?.toUpperCase();
    const limit = Math.max(1, Math.min(10000, params?.limit ?? 100));

    return this.state.ideas
      .filter((idea) => {
        if (params?.userId && idea.user_id !== params.userId) return false;
        if (statuses && !statuses.has(idea.status)) return false;
        if (symbol && idea.symbol !== symbol) return false;
        if (params?.scoringMode && normalizeScoringMode(idea.scoring_mode) !== params.scoringMode) return false;
        return true;
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
  }

  async listEvents(ideaId: string) {
    await this.ensureLoaded();
    return this.state.events
      .filter((event) => event.idea_id === ideaId)
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  }

  async listOpenIdeas() {
    return this.listIdeas({
      statuses: ["PENDING", "ACTIVE"],
      limit: 5000,
    });
  }

  async findOpenIdea(userId: string, symbol: string, scoringMode?: ScoringMode) {
    await this.ensureLoaded();
    const normalized = symbol.toUpperCase();
    return (
      this.state.ideas.find(
        (idea) =>
          idea.user_id === userId &&
          idea.symbol === normalized &&
          (scoringMode ? normalizeScoringMode(idea.scoring_mode) === scoringMode : true) &&
          (idea.status === "PENDING" || idea.status === "ACTIVE"),
      ) ?? null
    );
  }

  async listLocks(userId?: string) {
    await this.ensureLoaded();
    return this.state.ideas
      .filter((idea) => (userId ? idea.user_id === userId : true))
      .filter((idea) => idea.status === "PENDING" || idea.status === "ACTIVE")
      .map((idea) => ({
        user_id: idea.user_id,
        symbol: idea.symbol,
        scoring_mode: normalizeScoringMode(idea.scoring_mode),
        idea_id: idea.id,
        status: idea.status,
        created_at: idea.created_at,
      }));
  }

  async clearUserIdeas(userId: string) {
    await this.ensureLoaded();
    const beforeIdeas = this.state.ideas.length;
    const beforeEvents = this.state.events.length;
    const removedIdeaIds = new Set(
      this.state.ideas.filter((idea) => idea.user_id === userId).map((idea) => idea.id),
    );
    this.state.ideas = this.state.ideas.filter((idea) => idea.user_id !== userId);
    this.state.events = this.state.events.filter((event) => !removedIdeaIds.has(event.idea_id));
    await this.flush();
    return {
      deletedIdeas: beforeIdeas - this.state.ideas.length,
      deletedEvents: beforeEvents - this.state.events.length,
    };
  }

  /** Clear ALL trade ideas and events regardless of user_id */
  async clearAll() {
    await this.ensureLoaded();
    const deletedIdeas = this.state.ideas.length;
    const deletedEvents = this.state.events.length;
    this.state = defaultStorage();
    await this.flush();
    return { deletedIdeas, deletedEvents };
  }
}
