import type { Express } from "express";
import WebSocket from "ws";
import type { AdminProviderStore } from "../services/adminProviderStore.ts";

type ProviderType = "REST" | "WS" | "BOTH";

interface ProviderHealthInput {
  id?: string;
  name?: string;
  type?: ProviderType;
  enabled?: boolean;
  baseUrl?: string;
  wsUrl?: string;
  discoveryEndpoint?: string;
  extraPaths?: string[];
  apiKey?: string;
}

interface ProviderHealthItem {
  id: string;
  name: string;
  status: "OK" | "WARN" | "FAIL" | "SKIP";
  dataOk: boolean;
  httpOk: boolean;
  wsOk: boolean;
  latencyMs: number;
  checkedUrl?: string;
  detail: string;
}

const isHttpUrl = (raw?: string) => {
  const value = String(raw ?? "").trim().toLowerCase();
  return value.startsWith("http://") || value.startsWith("https://");
};

const isWsUrl = (raw?: string) => {
  const value = String(raw ?? "").trim().toLowerCase();
  return value.startsWith("ws://") || value.startsWith("wss://");
};

const joinUrl = (baseUrl: string, endpoint?: string) => {
  const base = String(baseUrl ?? "").trim();
  const path = String(endpoint ?? "").trim();
  if (!base) return "";
  if (!path) return base;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const left = base.endsWith("/") ? base.slice(0, -1) : base;
  const right = path.startsWith("/") ? path : `/${path}`;
  return `${left}${right}`;
};

const toWsProbePath = (pathValue: string) =>
  pathValue
    .replace(/<stream>/gi, "btcusdt@ticker")
    .replace(/\.\.\./g, "btcusdt@ticker");

const joinWsUrl = (baseUrl: string, endpoint?: string) => {
  const base = String(baseUrl ?? "").trim();
  const path = toWsProbePath(String(endpoint ?? "").trim());
  if (!base) return "";
  if (!path) return base;
  if (path.startsWith("ws://") || path.startsWith("wss://")) return path;
  const left = base.endsWith("/") ? base.slice(0, -1) : base;
  const right = path.startsWith("/") ? path : `/${path}`;
  return `${left}${right}`;
};

const toObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const hasPayloadData = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  return false;
};

const parseJsonIfPossible = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return trimmed;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
};

const testHttpProvider = async (
  url: string,
  apiKey?: string,
  timeoutMs = 8000,
): Promise<{ ok: boolean; latencyMs: number; detail: string; dataOk: boolean }> => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
    };
    const key = String(apiKey ?? "").trim();
    if (key) {
      headers["x-api-key"] = key;
      headers["X-API-KEY"] = key;
      headers["CG-API-KEY"] = key;
      headers["X-CMC_PRO_API_KEY"] = key;
    }
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        detail: `HTTP_${res.status}`,
        dataOk: false,
      };
    }

    const rawText = await res.text();
    const parsed = parseJsonIfPossible(rawText);
    const asObj = toObject(parsed);
    const obviousError =
      asObj &&
      (String(asObj.error ?? "").trim().length > 0 ||
        String(asObj.msg ?? "").trim().length > 0 ||
        String(asObj.message ?? "").trim().length > 0);
    if (obviousError) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        detail: `API_ERROR:${String(asObj?.error ?? asObj?.msg ?? asObj?.message ?? "unknown")}`,
        dataOk: false,
      };
    }

    const dataOk = hasPayloadData(parsed);
    return {
      ok: dataOk,
      latencyMs: Date.now() - started,
      detail: dataOk ? "HTTP_OK" : "HTTP_EMPTY",
      dataOk,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      detail: error instanceof Error ? error.message : "http_fetch_failed",
      dataOk: false,
    };
  } finally {
    clearTimeout(timer);
  }
};

const testWsProvider = async (
  url: string,
  timeoutMs = 8000,
): Promise<{ ok: boolean; latencyMs: number; detail: string }> =>
  new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const ws = new WebSocket(url, { handshakeTimeout: timeoutMs });
    const done = (ok: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // noop
      }
      resolve({
        ok,
        detail,
        latencyMs: Date.now() - started,
      });
    };
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        // noop
      }
      done(false, "WS_TIMEOUT");
    }, timeoutMs + 300);

    ws.on("open", () => {
      clearTimeout(timer);
      done(true, "WS_OK");
    });
    ws.on("error", (error) => {
      clearTimeout(timer);
      done(false, error instanceof Error ? error.message : "ws_error");
    });
  });

const assessProviderHealth = async (provider: ProviderHealthInput): Promise<ProviderHealthItem> => {
  const id = String(provider.id ?? Math.random().toString(36).slice(2, 10));
  const name = String(provider.name ?? id);
  const type = (String(provider.type ?? "REST").toUpperCase() as ProviderType);
  const enabled = provider.enabled !== false;
  const baseUrl = String(provider.baseUrl ?? "").trim();
  const wsUrl = String(provider.wsUrl ?? "").trim();
  const discoveryEndpoint = String(provider.discoveryEndpoint ?? "").trim();
  const extraPaths = Array.isArray(provider.extraPaths)
    ? provider.extraPaths.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const apiKey = String(provider.apiKey ?? "").trim();

  if (!enabled) {
    return {
      id,
      name,
      status: "SKIP",
      dataOk: false,
      httpOk: false,
      wsOk: false,
      latencyMs: 0,
      detail: "DISABLED",
    };
  }

  let httpOk = false;
  let wsOk = false;
  let dataOk = false;
  let latencyMs = 0;
  let checkedUrl = "";
  const details: string[] = [];

  if (type === "REST" || type === "BOTH") {
    const target = isHttpUrl(baseUrl) ? joinUrl(baseUrl, discoveryEndpoint) : "";
    checkedUrl = checkedUrl || target;
    if (!target) {
      details.push("REST_URL_INVALID");
    } else {
      const httpResult = await testHttpProvider(target, apiKey);
      httpOk = httpResult.ok;
      dataOk = dataOk || httpResult.dataOk;
      latencyMs = Math.max(latencyMs, httpResult.latencyMs);
      details.push(httpResult.detail);
    }
  }

  if (type === "WS" || type === "BOTH") {
    const wsTarget = isWsUrl(wsUrl) ? wsUrl : isWsUrl(baseUrl) ? baseUrl : "";
    const wsCandidates = new Set<string>();
    if (wsTarget) wsCandidates.add(wsTarget);
    if (wsTarget && extraPaths.length) {
      for (const extraPath of extraPaths) {
        const lower = extraPath.toLowerCase();
        if (!(lower.includes("/ws") || lower.includes("/stream"))) continue;
        wsCandidates.add(joinWsUrl(wsTarget, extraPath));
      }
    }
    const candidateList = [...wsCandidates];
    checkedUrl = checkedUrl || candidateList[0] || wsTarget;
    if (!candidateList.length) {
      details.push("WS_URL_INVALID");
    } else {
      let wsLastDetail = "WS_FAILED";
      let wsLastLatency = 0;
      for (const wsCandidate of candidateList) {
        const wsResult = await testWsProvider(wsCandidate);
        wsLastDetail = wsResult.detail;
        wsLastLatency = wsResult.latencyMs;
        checkedUrl = wsCandidate;
        if (wsResult.ok) {
          wsOk = true;
          latencyMs = Math.max(latencyMs, wsResult.latencyMs);
          details.push("WS_OK");
          break;
        }
      }
      if (!wsOk) {
        latencyMs = Math.max(latencyMs, wsLastLatency);
        details.push(wsLastDetail);
      }
    }
  }

  const status =
    type === "BOTH"
      ? httpOk && wsOk
        ? "OK"
        : httpOk || wsOk
          ? "WARN"
          : "FAIL"
      : type === "REST"
        ? (httpOk ? "OK" : "FAIL")
        : (wsOk ? "OK" : "FAIL");

  if (status === "OK" && !dataOk && (type === "REST" || type === "BOTH")) {
    return {
      id,
      name,
      status: "WARN",
      dataOk: false,
      httpOk,
      wsOk,
      latencyMs,
      checkedUrl,
      detail: "NO_DATA_PAYLOAD",
    };
  }

  return {
    id,
    name,
    status,
    dataOk,
    httpOk,
    wsOk,
    latencyMs,
    checkedUrl,
    detail: details.join(" | ") || "UNKNOWN",
  };
};

export const registerAdminProviderRoutes = (app: Express, providerStore?: AdminProviderStore) => {
  app.get("/api/admin/providers/config", async (_req, res) => {
    if (!providerStore) {
      return res.status(503).json({
        ok: false,
        error: "provider_store_unavailable",
      });
    }

    try {
      const providers = await providerStore.getAll();
      const fallbackPolicy = await providerStore.getFallbackPolicy();
      const branding = await providerStore.getBranding();
      res.json({
        ok: true,
        providers,
        fallbackPolicy,
        branding,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "provider_config_read_failed",
      });
    }
  });

  app.put("/api/admin/providers/config", async (req, res) => {
    if (!providerStore) {
      return res.status(503).json({
        ok: false,
        error: "provider_store_unavailable",
      });
    }

    const providers = req.body?.providers;
    const hasProviders = Array.isArray(providers);
    const hasBranding = Boolean(req.body && typeof req.body === "object" && "branding" in req.body);
    if (!hasProviders && !hasBranding) {
      return res.status(400).json({
        ok: false,
        error: "providers_or_branding_required",
      });
    }

    try {
      const saved = hasProviders ? await providerStore.replaceAll(providers) : await providerStore.getAll();
      const branding = hasBranding ? await providerStore.setBranding(req.body?.branding) : await providerStore.getBranding();
      const fallbackPolicy = await providerStore.getFallbackPolicy();
      res.json({
        ok: true,
        providers: saved,
        fallbackPolicy,
        branding,
        savedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "provider_config_save_failed",
      });
    }
  });

  app.post("/api/admin/providers/health", async (req, res) => {
    const input = req.body?.providers;
    const providers = Array.isArray(input) ? (input as ProviderHealthInput[]) : [];
    if (!providers.length) {
      return res.status(400).json({
        ok: false,
        error: "providers_required",
      });
    }

    const limited = providers.slice(0, 80);
    const results = await Promise.all(limited.map((provider) => assessProviderHealth(provider)));
    const summary = {
      total: results.length,
      ok: results.filter((item) => item.status === "OK").length,
      warn: results.filter((item) => item.status === "WARN").length,
      fail: results.filter((item) => item.status === "FAIL").length,
      skip: results.filter((item) => item.status === "SKIP").length,
    };
    res.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      summary,
      items: results,
    });
  });
};
