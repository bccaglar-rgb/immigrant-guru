import type { Express } from "express";
import type { AITradeIdeaEngine } from "../engines/aiTradeIdeas/AITradeIdeaEngine.ts";
import type { SystemScannerService } from "../services/systemScannerService.ts";
import { readEngineState } from "../engines/aiTradeIdeas/publisher.ts";
import type { AuthService } from "../payments/authService.ts";
import { requireAdmin } from "../middleware/authMiddleware.ts";

export function registerAiEngineV2Routes(
  app: Express,
  engine: AITradeIdeaEngine,
  systemScanner?: SystemScannerService,
  auth?: AuthService,
) {
  const adminMw = auth ? requireAdmin(auth) : (_req: any, _res: any, next: any) => { next(); };

  app.get("/api/ai-engine-v2/health", async (_req, res) => {
    try {
      const metrics = engine.getMetrics();
      const redisState = await readEngineState();
      res.json({
        ok: true,
        aiEngine: { enabled: engine.isEnabled(), lastCycle: metrics, state: redisState },
        scanner: { running: (systemScanner as any)?.running ?? false },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  /** Admin: start/stop AI engine + scanner */
  app.post("/api/ai-engine-v2/control", adminMw, async (req, res) => {
    const { action } = req.body ?? {};
    if (action === "start") {
      engine.start();
      systemScanner?.start();
      res.json({ ok: true, message: "AI engine + scanner started" });
    } else if (action === "stop") {
      engine.stop();
      systemScanner?.stop();
      res.json({ ok: true, message: "AI engine + scanner stopped" });
    } else {
      res.status(400).json({ ok: false, error: "action must be 'start' or 'stop'" });
    }
  });
}
