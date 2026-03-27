/**
 * Bitrium Prime AI Hub — LLM Caller
 *
 * Calls Claude Anthropic Messages API directly (raw fetch).
 * No provider store round-trip — uses CLAUDE_API_KEY directly.
 *
 * Endpoint: https://api.anthropic.com/v1/messages
 * Headers: x-api-key, anthropic-version: 2023-06-01
 * Timeout: configurable via AbortController
 */

import type { PrimeAiCallResult, PrimeAiConfig } from "./types.ts";
import { LOG_PREFIX } from "./config.ts";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Call Claude API with system + user prompts.
 * Returns raw text content or error.
 */
export async function callClaude(
  config: PrimeAiConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<PrimeAiCallResult> {
  const startMs = Date.now();

  if (!config.apiKey) {
    return {
      ok: false,
      error: "no_api_key",
      latencyMs: Date.now() - startMs,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: config.model,
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt },
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`${LOG_PREFIX} Claude HTTP ${res.status}: ${body.slice(0, 300)}`);

      if (res.status === 429) {
        return { ok: false, error: "rate_limited", latencyMs: Date.now() - startMs };
      }
      if (res.status === 529) {
        return { ok: false, error: "overloaded", latencyMs: Date.now() - startMs };
      }
      return { ok: false, error: `http_${res.status}`, latencyMs: Date.now() - startMs };
    }

    // Anthropic response format: { content: [{ type: "text", text: "..." }] }
    const json = await res.json() as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const content = json.content?.[0]?.text;
    if (!content) {
      return { ok: false, error: "empty_response", latencyMs: Date.now() - startMs };
    }

    const latencyMs = Date.now() - startMs;
    const inputTokens = json.usage?.input_tokens ?? 0;
    const outputTokens = json.usage?.output_tokens ?? 0;
    console.log(
      `${LOG_PREFIX} Claude responded in ${latencyMs}ms (${inputTokens}+${outputTokens} tokens, model=${config.model})`,
    );

    return { ok: true, raw: content, latencyMs };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`${LOG_PREFIX} Claude timeout after ${config.timeoutMs}ms`);
      return { ok: false, error: "timeout", latencyMs: Date.now() - startMs };
    }
    console.error(`${LOG_PREFIX} Claude fetch error:`, (err as Error).message);
    return { ok: false, error: "fetch_error", latencyMs: Date.now() - startMs };
  } finally {
    clearTimeout(timer);
  }
}
