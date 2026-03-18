import type { Express } from "express";
import type { AITradeIdeaEngine } from "../engines/aiTradeIdeas/AITradeIdeaEngine.ts";
import { readEngineState } from "../engines/aiTradeIdeas/publisher.ts";

export function registerAiEngineV2Routes(app: Express, engine: AITradeIdeaEngine) {
  app.get("/api/ai-engine-v2/health", async (_req, res) => {
    try {
      const metrics = engine.getMetrics();
      const redisState = await readEngineState();
      res.json({
        ok: true,
        enabled: engine.isEnabled(),
        lastCycle: metrics,
        state: redisState,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });
}
