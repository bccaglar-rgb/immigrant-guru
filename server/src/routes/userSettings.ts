import type { Express, Request } from "express";
import { UserSettingsStore } from "../services/userSettingsStore.ts";
import { isScoringMode } from "../services/scoringMode.ts";

const readUserId = (req: Request): string => {
  const raw = req.headers["x-user-id"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return "demo-user";
};

export const registerUserSettingsRoutes = (app: Express, store = new UserSettingsStore()) => {
  app.get("/api/user/settings", async (req, res) => {
    const userId = readUserId(req);
    try {
      const settings = await store.get(userId);
      return res.json({
        ok: true,
        user_id: userId,
        scoring_mode: settings.scoring_mode,
        flow_mode: settings.flow_mode,
        settings: {
          scoring_mode: settings.scoring_mode,
          flow_mode: settings.flow_mode,
          updated_at: settings.updated_at,
        },
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "settings_read_failed",
      });
    }
  });

  app.patch("/api/user/settings", async (req, res) => {
    const userId = readUserId(req);
    const nextMode = req.body?.scoring_mode;
    if (nextMode !== undefined && !isScoringMode(nextMode)) {
      return res.status(400).json({ ok: false, error: "invalid_scoring_mode" });
    }
    try {
      const current = await store.get(userId);
      const next = await store.update(userId, {
        scoring_mode: isScoringMode(nextMode) ? nextMode : current.scoring_mode,
        flow_mode: req.body?.flow_mode ?? current.flow_mode,
      });
      return res.json({
        ok: true,
        user_id: userId,
        scoring_mode: next.scoring_mode,
        flow_mode: next.flow_mode,
        settings: {
          scoring_mode: next.scoring_mode,
          flow_mode: next.flow_mode,
          updated_at: next.updated_at,
        },
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "settings_write_failed",
      });
    }
  });
};
