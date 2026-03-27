import type { AiProviderStore, AiProviderRecord } from "../../services/aiProviderStore.ts";
import type { AiEngineConfig, AiCallResult } from "./types.ts";

const PREFIX = "[AIEngineV2:Evaluator]";

// OpenAI-compatible model fallback chain
const OPENAI_MODEL_FALLBACKS = ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"];

/**
 * Normalize a provider endpoint to ensure it ends with /chat/completions.
 * Matches the same logic as resolveProviderEndpoint() in aiTradeIdeas.ts.
 */
function normalizeEndpoint(urlRaw: string, fallback: string): string {
  const base = String(urlRaw ?? "").trim() || fallback;
  if (!base) return "";
  const lower = base.toLowerCase();
  if (lower.endsWith("/chat/completions") || lower.endsWith("/responses")) return base;
  if (lower.endsWith("/v1") || lower.endsWith("/compatible-mode/v1")) {
    return `${base.replace(/\/+$/, "")}/chat/completions`;
  }
  if (lower.includes("/v1/")) return base;
  return `${base.replace(/\/+$/, "")}/chat/completions`;
}

function isAnthropicEndpoint(url: string): boolean {
  return url.toLowerCase().includes("anthropic.com");
}

function resolveEndpoint(provider: AiProviderRecord): string {
  // Anthropic API uses /v1/messages (not /chat/completions)
  if (provider.id === "CLAUDE") {
    const base = String(provider.baseUrl ?? "").trim();
    if (base && isAnthropicEndpoint(base)) return base.replace(/\/+$/, "").replace(/\/v1\/messages$/, "") + "/v1/messages";
    return "https://api.anthropic.com/v1/messages";
  }
  if (provider.id === "CHATGPT" || provider.id === "QWEN2") {
    return normalizeEndpoint(provider.baseUrl, "https://api.openai.com/v1/chat/completions");
  }
  if (provider.id === "QWEN") {
    // QWEN may point to Anthropic API or OpenRouter
    const base = String(provider.baseUrl ?? "").trim();
    if (base && isAnthropicEndpoint(base)) return base.replace(/\/+$/, "").replace(/\/v1\/messages$/, "") + "/v1/messages";
    return normalizeEndpoint(provider.baseUrl, "https://openrouter.ai/api/v1/chat/completions");
  }
  return normalizeEndpoint(provider.baseUrl, "");
}

/**
 * Calls the configured LLM provider with the evaluation prompt.
 * Supports timeout, model fallbacks, and structured error returns.
 */
export async function callAi(
  config: AiEngineConfig,
  aiProviderStore: AiProviderStore,
  systemPrompt: string,
  userPrompt: string,
): Promise<AiCallResult> {
  const start = Date.now();

  let providers: AiProviderRecord[];
  try {
    providers = await aiProviderStore.getAll();
  } catch {
    return { ok: false, error: "provider_store_error", latencyMs: Date.now() - start };
  }

  const primary = providers.find((p) => p.id === config.aiProvider && p.enabled);
  if (!primary || !primary.apiKey) {
    // Try fallback to any enabled provider
    const fallback = providers.find((p) => p.enabled && p.apiKey);
    if (!fallback) {
      return { ok: false, error: `no_enabled_provider`, latencyMs: Date.now() - start };
    }
    console.warn(`${PREFIX} Primary ${config.aiProvider} unavailable, falling back to ${fallback.id}`);
    return await tryProvider(fallback, config, systemPrompt, userPrompt, start);
  }

  return await tryProvider(primary, config, systemPrompt, userPrompt, start);
}

async function tryProvider(
  provider: AiProviderRecord,
  config: AiEngineConfig,
  systemPrompt: string,
  userPrompt: string,
  startTs: number,
): Promise<AiCallResult> {
  const endpoint = resolveEndpoint(provider);
  if (!endpoint) {
    return { ok: false, error: "no_endpoint", latencyMs: Date.now() - startTs, provider: provider.id };
  }
  const apiKey = provider.apiKey ?? "";
  if (!apiKey) {
    return { ok: false, error: "no_api_key", latencyMs: Date.now() - startTs, provider: provider.id };
  }

  // Build model fallback chain
  const isOpenAi = provider.id === "CHATGPT" || provider.id === "QWEN2";
  const isAnthropic = provider.id === "CLAUDE" || (provider.id === "QWEN" && isAnthropicEndpoint(provider.baseUrl));
  const models = isOpenAi
    ? [config.aiModel, ...OPENAI_MODEL_FALLBACKS.filter((m) => m !== config.aiModel)]
    : isAnthropic
      ? [provider.model || "claude-sonnet-4-6"]
      : [provider.model || config.aiModel];

  for (const model of models) {
    const result = await tryModel(endpoint, apiKey, model, config, systemPrompt, userPrompt);
    if (result.ok) {
      return { ...result, latencyMs: Date.now() - startTs, provider: provider.id };
    }
    // 404 = model not found, try next in chain
    if (result.error === "model_not_found") {
      console.warn(`${PREFIX} Model ${model} not found for ${provider.id}, trying next`);
      continue;
    }
    // Other errors: don't retry same provider
    return { ...result, latencyMs: Date.now() - startTs, provider: provider.id };
  }

  return { ok: false, error: "all_models_failed", latencyMs: Date.now() - startTs, provider: provider.id };
}

async function tryModel(
  endpoint: string,
  apiKey: string,
  model: string,
  config: AiEngineConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<AiCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);

  // Detect Anthropic API (different format than OpenAI)
  const isAnthropic = isAnthropicEndpoint(endpoint);

  try {
    if (isAnthropic) {
      return await callAnthropicModel(endpoint, apiKey, model, config, systemPrompt, userPrompt, controller.signal);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    // OpenRouter requires HTTP-Referer
    if (endpoint.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "https://bitrium.com";
      headers["X-Title"] = "Bitrium AIEngineV2";
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: config.aiTemperature,
        max_tokens: config.aiMaxTokens,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 404) {
        return { ok: false, error: "model_not_found" };
      }
      const body = await res.text().catch(() => "");
      console.error(`${PREFIX} HTTP ${res.status} from ${model}: ${body.slice(0, 300)}`);
      return { ok: false, error: `http_${res.status}` };
    }

    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;

    if (!content) {
      return { ok: false, error: "empty_response" };
    }

    return { ok: true, raw: content };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`${PREFIX} Timeout after ${config.aiTimeoutMs}ms for ${model}`);
      return { ok: false, error: "timeout" };
    }
    console.error(`${PREFIX} Fetch error for ${model}:`, (err as Error).message);
    return { ok: false, error: "fetch_error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Anthropic Messages API handler.
 * Uses x-api-key header, different body/response format.
 */
async function callAnthropicModel(
  endpoint: string,
  apiKey: string,
  model: string,
  config: AiEngineConfig,
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal,
): Promise<AiCallResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  // Anthropic Claude doesn't support response_format: json_object
  // Enforce JSON output via system prompt suffix
  const jsonEnforcedSystem = systemPrompt + "\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no code blocks, no explanation text. Output a single JSON object starting with { and ending with }.";

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      system: jsonEnforcedSystem,
      messages: [
        { role: "user", content: userPrompt + "\n\nRespond with valid JSON only." },
      ],
      temperature: config.aiTemperature,
      max_tokens: config.aiMaxTokens,
    }),
    signal,
  });

  if (!res.ok) {
    if (res.status === 404) {
      return { ok: false, error: "model_not_found" };
    }
    const body = await res.text().catch(() => "");
    console.error(`${PREFIX} Anthropic HTTP ${res.status} from ${model}: ${body.slice(0, 300)}`);
    return { ok: false, error: `http_${res.status}` };
  }

  // Anthropic response format: { content: [{ type: "text", text: "..." }] }
  const json = await res.json() as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const content = json.content?.[0]?.text;

  if (!content) {
    return { ok: false, error: "empty_response" };
  }

  return { ok: true, raw: content };
}
