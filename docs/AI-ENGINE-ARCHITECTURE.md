# Bitrium AI Engine Architecture

> Status: Architecture Proposal
> Last Updated: 2026-04-04
> Priority: High -- core differentiator and significant operational cost

---

## Table of Contents

1. [Current State and Weaknesses](#current-state-and-weaknesses)
2. [Provider Abstraction Layer](#provider-abstraction-layer)
3. [Prompt Routing and Model Selection](#prompt-routing-and-model-selection)
4. [Caching Strategy](#caching-strategy)
5. [Fallback Chain](#fallback-chain)
6. [Timeout, Retry, and Circuit Breaker](#timeout-retry-and-circuit-breaker)
7. [Output Quality and Hallucination Reduction](#output-quality-and-hallucination-reduction)
8. [Output Schema Standardization](#output-schema-standardization)
9. [Cost Control](#cost-control)
10. [Confidence Scoring](#confidence-scoring)
11. [AI Audit Logging](#ai-audit-logging)
12. [Local Inference (Future)](#local-inference)
13. [Pipeline Design](#pipeline-design)

---

## 1. Current State and Weaknesses

### Current Implementation

- Direct API calls to OpenAI, Claude, and Qwen scattered across codebase
- No provider abstraction -- each integration is custom
- No caching -- identical prompts result in repeated API calls
- No fallback -- if one provider is down, the feature fails
- No cost tracking -- monthly bills are unpredictable
- No output validation -- AI responses parsed optimistically
- No circuit breaker -- slow providers block request threads

### Weakness Assessment

| Weakness | Impact | Priority |
|----------|--------|----------|
| No provider abstraction | Code duplication, hard to switch models | High |
| No caching | Unnecessary cost, higher latency | High |
| No fallback chain | Single provider failure = feature outage | High |
| No output validation | Malformed responses crash downstream | High |
| No cost tracking | Unpredictable expenses | Medium |
| No circuit breaker | Cascading failures from slow providers | Medium |
| No prompt versioning | Can't A/B test or roll back prompts | Medium |
| Hardcoded temperatures | Suboptimal for different use cases | Low |

---

## 2. Provider Abstraction Layer

### Interface Design

```javascript
class AIProvider {
  /**
   * @param {string} model - Model identifier
   * @param {Array} messages - Chat messages [{role, content}]
   * @param {Object} options - {temperature, maxTokens, responseFormat, timeout}
   * @returns {AIResponse}
   */
  async chat(model, messages, options = {}) {
    throw new Error('Not implemented');
  }

  getAvailableModels() { throw new Error('Not implemented'); }
  getModelCapabilities(model) { throw new Error('Not implemented'); }
}

class AIResponse {
  constructor({ content, model, provider, usage, latencyMs, finishReason }) {
    this.content = content;
    this.model = model;
    this.provider = provider;
    this.usage = usage;               // { promptTokens, completionTokens, totalTokens }
    this.latencyMs = latencyMs;
    this.finishReason = finishReason;  // 'stop', 'length', 'content_filter'
    this.timestamp = new Date();
  }
}
```

### Provider Implementations

```javascript
class OpenAIProvider extends AIProvider {
  constructor(apiKey) {
    super();
    this.client = new OpenAI({ apiKey });
  }

  async chat(model, messages, options = {}) {
    const start = Date.now();
    const response = await this.client.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 2048,
      response_format: options.responseFormat,
    });

    return new AIResponse({
      content: response.choices[0].message.content,
      model,
      provider: 'openai',
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      latencyMs: Date.now() - start,
      finishReason: response.choices[0].finish_reason,
    });
  }
}

class AnthropicProvider extends AIProvider {
  constructor(apiKey) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  async chat(model, messages, options = {}) {
    const start = Date.now();
    // Convert chat format to Anthropic format
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model,
      system: systemMsg?.content,
      messages: chatMsgs,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 2048,
    });

    return new AIResponse({
      content: response.content[0].text,
      model,
      provider: 'anthropic',
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      latencyMs: Date.now() - start,
      finishReason: response.stop_reason,
    });
  }
}

class QwenProvider extends AIProvider {
  // Similar implementation for Qwen/DashScope API
}
```

### Provider Registry

```javascript
class AIProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.modelToProvider = new Map();
  }

  register(name, provider, models) {
    this.providers.set(name, provider);
    for (const model of models) {
      this.modelToProvider.set(model, name);
    }
  }

  getProvider(model) {
    const providerName = this.modelToProvider.get(model);
    return this.providers.get(providerName);
  }
}

// Initialization
const registry = new AIProviderRegistry();
registry.register('openai', new OpenAIProvider(OPENAI_KEY), [
  'gpt-4o', 'gpt-4o-mini'
]);
registry.register('anthropic', new AnthropicProvider(ANTHROPIC_KEY), [
  'claude-sonnet-4-20250514', 'claude-haiku-3'
]);
registry.register('qwen', new QwenProvider(QWEN_KEY), [
  'qwen-turbo', 'qwen-plus'
]);
```

---

## 3. Prompt Routing and Model Selection

### Model Tiers

| Tier | Models | Use Case | Cost/1K tokens |
|------|--------|----------|---------------|
| Small (screening) | gpt-4o-mini, claude-haiku-3, qwen-turbo | Classification, filtering, simple extraction | ~$0.0002 |
| Large (evaluation) | gpt-4o, claude-sonnet-4, qwen-plus | Deep analysis, complex reasoning, report generation | ~$0.005 |

### Routing Policy

```javascript
const ROUTING_POLICY = {
  // Task type -> model configuration
  'market_screening': {
    model: 'gpt-4o-mini',
    temperature: 0.1,
    maxTokens: 512,
    tier: 'small',
    description: 'Quick pass/fail screening of market conditions'
  },
  'signal_classification': {
    model: 'gpt-4o-mini',
    temperature: 0.0,
    maxTokens: 256,
    tier: 'small',
    description: 'Classify signal as buy/sell/hold'
  },
  'deep_analysis': {
    model: 'claude-sonnet-4-20250514',
    temperature: 0.2,
    maxTokens: 4096,
    tier: 'large',
    description: 'Comprehensive market analysis with reasoning'
  },
  'report_generation': {
    model: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 4096,
    tier: 'large',
    description: 'Generate user-facing analysis reports'
  },
  'data_extraction': {
    model: 'gpt-4o-mini',
    temperature: 0.0,
    maxTokens: 1024,
    tier: 'small',
    description: 'Extract structured data from text'
  },
  'alert_evaluation': {
    model: 'qwen-turbo',
    temperature: 0.0,
    maxTokens: 256,
    tier: 'small',
    description: 'Evaluate if alert conditions are met'
  }
};
```

### Two-Stage Pipeline Pattern

For expensive analysis, use a small model to screen first:

```javascript
async function analyzeCoinWithScreening(coinData) {
  // Stage 1: Quick screening with small model
  const screening = await aiService.chat('market_screening', [
    { role: 'system', content: SCREENING_PROMPT },
    { role: 'user', content: JSON.stringify(coinData) }
  ]);

  const screenResult = JSON.parse(screening.content);

  // Only proceed to expensive analysis if screening passes
  if (screenResult.score < 0.3) {
    return { result: 'rejected_at_screening', score: screenResult.score };
  }

  // Stage 2: Deep analysis with large model
  const analysis = await aiService.chat('deep_analysis', [
    { role: 'system', content: ANALYSIS_PROMPT },
    { role: 'user', content: JSON.stringify({ ...coinData, screeningScore: screenResult.score }) }
  ]);

  return JSON.parse(analysis.content);
}
```

This pattern reduces cost by 60-80% because most candidates are filtered by the cheap model.

---

## 4. Caching Strategy

### Prompt Hash Caching

```javascript
import { createHash } from 'crypto';

class AICache {
  constructor(redis, defaultTTL = 3600) {
    this.redis = redis;
    this.defaultTTL = defaultTTL;
  }

  getCacheKey(model, messages, options) {
    const payload = JSON.stringify({ model, messages, temperature: options.temperature });
    return `ai:cache:${createHash('sha256').update(payload).digest('hex')}`;
  }

  async get(model, messages, options) {
    const key = this.getCacheKey(model, messages, options);
    const cached = await this.redis.get(key);
    if (cached) {
      const response = JSON.parse(cached);
      response._cached = true;
      return response;
    }
    return null;
  }

  async set(model, messages, options, response, ttl) {
    const key = this.getCacheKey(model, messages, options);
    await this.redis.setex(key, ttl || this.defaultTTL, JSON.stringify(response));
  }
}
```

### Cache TTL by Task Type

| Task Type | Cache TTL | Rationale |
|-----------|-----------|-----------|
| market_screening | 5 minutes | Market data changes rapidly |
| signal_classification | 5 minutes | Time-sensitive |
| deep_analysis | 30 minutes | More stable, expensive to regenerate |
| report_generation | 1 hour | User-facing, content doesn't change fast |
| data_extraction | 24 hours | Deterministic for same input |
| alert_evaluation | No cache | Must be real-time |

### Cache Invalidation

- TTL-based expiry (primary mechanism)
- Manual invalidation when prompt templates are updated
- Cache key includes model version -- model upgrades auto-invalidate

---

## 5. Fallback Chain

### Fallback Configuration

```javascript
const FALLBACK_CHAINS = {
  'gpt-4o': ['claude-sonnet-4-20250514', 'qwen-plus'],
  'gpt-4o-mini': ['claude-haiku-3', 'qwen-turbo'],
  'claude-sonnet-4-20250514': ['gpt-4o', 'qwen-plus'],
  'claude-haiku-3': ['gpt-4o-mini', 'qwen-turbo'],
  'qwen-turbo': ['gpt-4o-mini', 'claude-haiku-3'],
  'qwen-plus': ['gpt-4o', 'claude-sonnet-4-20250514'],
};
```

### Fallback Execution

```javascript
async function chatWithFallback(taskType, messages) {
  const config = ROUTING_POLICY[taskType];
  const models = [config.model, ...(FALLBACK_CHAINS[config.model] || [])];

  for (const model of models) {
    const provider = registry.getProvider(model);
    if (!provider) continue;

    // Check circuit breaker
    if (circuitBreaker.isOpen(model)) {
      log.warn('Circuit breaker open, skipping model', { model });
      continue;
    }

    try {
      const response = await provider.chat(model, messages, {
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeout: 30000,
      });

      // Validate output
      if (config.responseSchema) {
        validateOutput(response.content, config.responseSchema);
      }

      return response;

    } catch (error) {
      log.error('AI provider failed, trying fallback', { model, error: error.message });
      circuitBreaker.recordFailure(model);
    }
  }

  throw new Error(`All AI providers failed for task: ${taskType}`);
}
```

---

## 6. Timeout, Retry, and Circuit Breaker

### Timeout Configuration

| Model Tier | Timeout | Rationale |
|-----------|---------|-----------|
| Small | 10 seconds | Fast models, fail early |
| Large | 30 seconds | Complex reasoning takes time |
| Streaming | 60 seconds | Long responses streamed incrementally |

### Retry Policy

```javascript
const RETRY_CONFIG = {
  maxRetries: 2,
  retryableErrors: [
    'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND',
    'rate_limit_exceeded', '529', '503', '500'
  ],
  backoff: {
    initial: 1000,
    multiplier: 2,
    max: 10000,
    jitter: true
  }
};
```

### Circuit Breaker

```javascript
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;     // 1 minute
    this.halfOpenRequests = options.halfOpenRequests || 1;
    this.states = new Map(); // model -> { state, failures, lastFailure, halfOpenAttempts }
  }

  isOpen(model) {
    const state = this.states.get(model);
    if (!state) return false;

    if (state.state === 'open') {
      // Check if reset timeout has passed
      if (Date.now() - state.lastFailure > this.resetTimeout) {
        state.state = 'half-open';
        state.halfOpenAttempts = 0;
        return false;
      }
      return true;
    }

    return false;
  }

  recordFailure(model) {
    const state = this.states.get(model) || { state: 'closed', failures: 0 };
    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= this.failureThreshold) {
      state.state = 'open';
      log.warn('Circuit breaker opened', { model, failures: state.failures });
      // Emit metric
      metrics.circuitBreakerOpen.inc({ model });
    }

    this.states.set(model, state);
  }

  recordSuccess(model) {
    this.states.set(model, { state: 'closed', failures: 0 });
  }
}
```

---

## 7. Output Quality and Hallucination Reduction

### JSON Schema Enforcement

```javascript
// For OpenAI: use response_format with json_schema
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages,
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'market_analysis',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          direction: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: { type: 'string' },
          keyFactors: { type: 'array', items: { type: 'string' } },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] }
        },
        required: ['symbol', 'direction', 'confidence', 'reasoning', 'keyFactors', 'riskLevel'],
        additionalProperties: false
      }
    }
  }
});
```

### Temperature Guidelines

| Task | Temperature | Rationale |
|------|------------|-----------|
| Data extraction | 0.0 | Deterministic, factual |
| Classification | 0.0 | Consistent categorization |
| Screening | 0.1 | Mostly deterministic with slight variation |
| Analysis | 0.2 | Balanced reasoning |
| Report generation | 0.3 | Some creativity for readability |
| Never exceed | 0.5 | Financial context requires reliability |

### Output Validation Pipeline

```javascript
async function validateAndParse(response, schema) {
  // 1. Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(response.content);
  } catch (e) {
    // Attempt to extract JSON from markdown code blocks
    const match = response.content.match(/```json?\n?([\s\S]*?)\n?```/);
    if (match) {
      parsed = JSON.parse(match[1]);
    } else {
      throw new AIOutputError('Response is not valid JSON', response);
    }
  }

  // 2. Validate against schema
  const valid = ajv.validate(schema, parsed);
  if (!valid) {
    throw new AIOutputError(`Schema validation failed: ${ajv.errorsText()}`, response);
  }

  // 3. Sanity checks
  if (parsed.confidence !== undefined) {
    if (parsed.confidence < 0 || parsed.confidence > 1) {
      throw new AIOutputError('Confidence out of range [0,1]', response);
    }
  }

  return parsed;
}
```

---

## 8. Output Schema Standardization

### Standard Analysis Response

```typescript
interface MarketAnalysis {
  symbol: string;
  exchange: string;
  timestamp: string;              // ISO 8601
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;             // 0.0 - 1.0
  timeframe: '1h' | '4h' | '1d' | '1w';
  reasoning: string;
  keyFactors: string[];
  riskLevel: 'low' | 'medium' | 'high';
  priceTargets?: {
    entry: number;
    stopLoss: number;
    takeProfit: number[];
  };
  metadata: {
    model: string;
    provider: string;
    latencyMs: number;
    cached: boolean;
    promptVersion: string;
  };
}
```

### Standard Screening Response

```typescript
interface ScreeningResult {
  symbol: string;
  pass: boolean;
  score: number;                  // 0.0 - 1.0
  reason: string;
  metadata: {
    model: string;
    provider: string;
    latencyMs: number;
    cached: boolean;
  };
}
```

### Standard Alert Evaluation Response

```typescript
interface AlertEvaluation {
  alertId: string;
  triggered: boolean;
  confidence: number;
  currentValue: string;
  thresholdValue: string;
  message: string;
}
```

---

## 9. Cost Control

### Token and Cost Tracking

```javascript
class AIBillingTracker {
  constructor(redis) {
    this.redis = redis;
  }

  async recordUsage(response, taskType, userId) {
    const cost = this.calculateCost(response.provider, response.model, response.usage);

    // Per-user daily cost
    const userKey = `ai:cost:user:${userId}:${today()}`;
    await this.redis.incrbyfloat(userKey, cost);
    await this.redis.expire(userKey, 86400 * 7);

    // Per-model daily cost
    const modelKey = `ai:cost:model:${response.model}:${today()}`;
    await this.redis.incrbyfloat(modelKey, cost);

    // Per-task-type daily cost
    const taskKey = `ai:cost:task:${taskType}:${today()}`;
    await this.redis.incrbyfloat(taskKey, cost);

    // Global daily cost
    const globalKey = `ai:cost:global:${today()}`;
    await this.redis.incrbyfloat(globalKey, cost);

    // Prometheus metrics
    metrics.aiTokensUsed.inc({
      provider: response.provider,
      model: response.model,
      type: 'prompt'
    }, response.usage.promptTokens);
    metrics.aiTokensUsed.inc({
      provider: response.provider,
      model: response.model,
      type: 'completion'
    }, response.usage.completionTokens);
    metrics.aiCostUsd.inc({
      provider: response.provider,
      model: response.model,
      task: taskType
    }, cost);
  }

  calculateCost(provider, model, usage) {
    const rates = PRICING[provider]?.[model];
    if (!rates) return 0;
    return (usage.promptTokens * rates.input + usage.completionTokens * rates.output) / 1000;
  }
}

const PRICING = {
  openai: {
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  },
  anthropic: {
    'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
    'claude-haiku-3': { input: 0.00025, output: 0.00125 },
  },
  qwen: {
    'qwen-turbo': { input: 0.0002, output: 0.0006 },
    'qwen-plus': { input: 0.004, output: 0.012 },
  }
};
```

### Cost Limits

| Scope | Daily Limit | Action on Breach |
|-------|------------|------------------|
| Per user (Explorer) | $0.50 | Reject AI requests, show upgrade prompt |
| Per user (Trader) | $2.00 | Reject AI requests, show upgrade prompt |
| Per user (Titan) | $5.00 | Reject AI requests, notify |
| Global daily | $200 | Alert team, switch to cheaper models |
| Global monthly | $3000 | Alert team, review usage patterns |

### Cost Optimization Rules

1. Always try cache before making API call
2. Use small models for screening (saves 90%+ on filtered items)
3. Set aggressive maxTokens limits (don't let models ramble)
4. Batch similar requests where possible
5. Track cache hit ratio -- target > 30%

---

## 10. Confidence Scoring

### Confidence Calibration

```javascript
function calibrateConfidence(rawConfidence, factors) {
  let adjusted = rawConfidence;

  // Reduce confidence for volatile markets
  if (factors.volatility > 0.05) { // 5% daily volatility
    adjusted *= 0.8;
  }

  // Reduce confidence for low-volume assets
  if (factors.volume24h < 1000000) { // < $1M daily volume
    adjusted *= 0.7;
  }

  // Reduce confidence if data is stale
  if (factors.dataAgeMinutes > 15) {
    adjusted *= 0.9;
  }

  // Boost confidence if multiple indicators agree
  if (factors.indicatorAgreement > 0.8) {
    adjusted = Math.min(adjusted * 1.1, 0.95); // Cap at 0.95
  }

  return Math.round(adjusted * 100) / 100;
}
```

### Confidence Display

| Range | Label | Color | Action |
|-------|-------|-------|--------|
| 0.0 - 0.3 | Low | Red | Show with strong disclaimers |
| 0.3 - 0.6 | Medium | Yellow | Show with disclaimers |
| 0.6 - 0.8 | High | Green | Show normally |
| 0.8 - 1.0 | Very High | Green (bold) | Show prominently |

---

## 11. AI Audit Logging

### What to Log

```javascript
async function logAICall(taskType, messages, response, userId) {
  await db.query(`
    INSERT INTO ai_audit_log (
      user_id, task_type, model, provider,
      prompt_hash, prompt_tokens, completion_tokens,
      latency_ms, cost_usd, cached, confidence,
      finish_reason, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
  `, [
    userId, taskType, response.model, response.provider,
    hashPrompt(messages), response.usage.promptTokens, response.usage.completionTokens,
    response.latencyMs, calculateCost(response), response._cached || false,
    extractConfidence(response), response.finishReason
  ]);
}
```

### Audit Log Schema

```sql
CREATE TABLE ai_audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             INTEGER REFERENCES users(id),
    task_type           TEXT NOT NULL,
    model               TEXT NOT NULL,
    provider            TEXT NOT NULL,
    prompt_hash         TEXT NOT NULL,
    prompt_tokens       INTEGER,
    completion_tokens   INTEGER,
    latency_ms          INTEGER,
    cost_usd            NUMERIC(10,6),
    cached              BOOLEAN DEFAULT false,
    confidence          NUMERIC(3,2),
    finish_reason       TEXT,
    error               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_audit_user ON ai_audit_log (user_id, created_at DESC);
CREATE INDEX idx_ai_audit_model ON ai_audit_log (model, created_at DESC);
CREATE INDEX idx_ai_audit_task ON ai_audit_log (task_type, created_at DESC);
CREATE INDEX idx_ai_audit_cost ON ai_audit_log (created_at, cost_usd);
```

### Do NOT Log

- Full prompt text (may contain user data)
- Full response text (may contain sensitive analysis)
- API keys or tokens
- Store only the prompt hash for cache debugging

---

## 12. Local Inference

### When to Consider Local Inference

- Monthly AI costs exceed $5,000
- Latency requirements below 100ms
- Privacy requirements for user data
- Offline/air-gapped deployment needed

### Recommended Setup

```javascript
const LOCAL_MODELS = {
  'local-screening': {
    engine: 'llama.cpp',           // or vLLM, TGI
    model: 'Qwen2.5-7B-Instruct-GGUF',
    quantization: 'Q4_K_M',
    contextLength: 4096,
    gpuRequired: true,             // NVIDIA GPU recommended
    minVRAM: '8GB',
    estimatedLatency: '50-200ms',
    tasks: ['market_screening', 'signal_classification', 'alert_evaluation']
  }
};
```

### Hybrid Architecture

```
User Request
    |
    v
Task Router
    |
    +-- Simple tasks (screening, classification) --> Local Model
    |
    +-- Complex tasks (deep analysis, reports)   --> Cloud Provider
```

### Cost Comparison

| Scenario | Cloud Cost/mo | Local Cost/mo | Break-even |
|----------|-------------|---------------|------------|
| 100K screening calls | $200 | $80 (GPU server) | Month 1 |
| 10K analysis calls | $500 | N/A (too complex for local) | Never |
| Mixed workload | $700 | $80 + $500 = $580 | Month 3 |

---

## 13. Pipeline Design

### End-to-End AI Pipeline

```
1. Request Intake
   - Validate input
   - Check user tier limits
   - Check cost limits

2. Cache Check
   - Hash prompt + model + temperature
   - Return cached result if available

3. Task Routing
   - Determine task type
   - Select model based on routing policy

4. Execution
   - Try primary model
   - Fallback chain if needed
   - Circuit breaker protection

5. Output Processing
   - Parse JSON response
   - Validate against schema
   - Calibrate confidence scores

6. Post-Processing
   - Cache response
   - Track costs
   - Audit log
   - Emit metrics

7. Response Delivery
   - Return standardized response
   - Include metadata (model, latency, confidence)
```

### Pipeline Implementation

```javascript
class AIPipeline {
  async execute(taskType, input, userId) {
    const config = ROUTING_POLICY[taskType];
    const messages = this.buildMessages(taskType, input);

    // 1. Check limits
    await this.checkUserLimits(userId, taskType);

    // 2. Cache check
    const cached = await this.cache.get(config.model, messages, config);
    if (cached) {
      await this.billing.recordUsage(cached, taskType, userId);
      return cached;
    }

    // 3. Execute with fallback
    const response = await chatWithFallback(taskType, messages);

    // 4. Validate output
    const validated = await validateAndParse(response, config.responseSchema);

    // 5. Post-process
    await Promise.all([
      this.cache.set(config.model, messages, config, response, CACHE_TTL[taskType]),
      this.billing.recordUsage(response, taskType, userId),
      logAICall(taskType, messages, response, userId),
    ]);

    return { ...validated, metadata: response.metadata };
  }
}
```

---

## Appendix: Prometheus Metrics for AI Engine

```
# Request metrics
ai_requests_total{task_type, model, provider, status="success|failure|cached"}
ai_request_duration_seconds{task_type, model, quantile="0.5|0.9|0.99"}

# Token metrics
ai_tokens_used_total{provider, model, type="prompt|completion"}
ai_cost_usd_total{provider, model, task_type}

# Cache metrics
ai_cache_hits_total{task_type}
ai_cache_misses_total{task_type}

# Circuit breaker
ai_circuit_breaker_state{model} -- 0=closed, 1=half-open, 2=open
ai_circuit_breaker_trips_total{model}

# Quality metrics
ai_output_validation_failures_total{task_type, error_type}
ai_confidence_score{task_type, quantile="0.5|0.9"}

# Cost control
ai_daily_cost_usd{scope="global|user"}
ai_cost_limit_breaches_total{scope="user|global"}
```
