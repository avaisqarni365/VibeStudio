import { createLogger } from '@vibestudio/logging';

const logger = createLogger({ service: 'ai-provider' });

// ── Provider Definitions ──
export const AI_PROVIDERS: Record<string, { name: string; icon: string; models: { id: string; name: string; maxTokens: number }[]; baseUrl: string; authHeader: string }> = {
  openai: {
    name: 'OpenAI',
    icon: '🟢',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxTokens: 128000 },
      { id: 'gpt-4.1', name: 'GPT-4.1', maxTokens: 1000000 },
      { id: 'o4-mini', name: 'o4-mini (reasoning)', maxTokens: 200000 },
    ],
    baseUrl: 'https://api.openai.com/v1',
    authHeader: 'Bearer',
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    icon: '🟠',
    models: [
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8 (most capable)', maxTokens: 1000000 },
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', maxTokens: 1000000 },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (balanced)', maxTokens: 1000000 },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (fast)', maxTokens: 200000 },
    ],
    baseUrl: 'https://api.anthropic.com/v1',
    authHeader: 'x-api-key',
  },
  deepseek: {
    name: 'DeepSeek',
    icon: '🔵',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', maxTokens: 64000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (reasoning)', maxTokens: 64000 },
    ],
    baseUrl: 'https://api.deepseek.com/v1',
    authHeader: 'Bearer',
  },
  kimi: {
    name: 'Kimi (Moonshot)',
    icon: '🌙',
    models: [
      { id: 'moonshot-v1-128k', name: 'Kimi 128K', maxTokens: 128000 },
      { id: 'moonshot-v1-32k', name: 'Kimi 32K', maxTokens: 32000 },
      { id: 'moonshot-v1-8k', name: 'Kimi 8K', maxTokens: 8000 },
    ],
    baseUrl: 'https://api.moonshot.cn/v1',
    authHeader: 'Bearer',
  },
  grok: {
    name: 'Grok (xAI)',
    icon: '⚡',
    models: [
      { id: 'grok-3', name: 'Grok 3', maxTokens: 131072 },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', maxTokens: 131072 },
      { id: 'grok-2', name: 'Grok 2', maxTokens: 131072 },
    ],
    baseUrl: 'https://api.x.ai/v1',
    authHeader: 'Bearer',
  },
  // Free-tier provider — used as the default when no API key is set for
  // the org. Groq runs llama-3.3-70b and qwen-32b at zero cost up to
  // generous rate limits; perfect for short structured outputs like the
  // invoice/fare intent parser used by /ai-assistant.
  groq: {
    name: 'Groq (free tier)',
    icon: '🟣',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (free)', maxTokens: 32768 },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (free)', maxTokens: 8192 },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (free)', maxTokens: 32768 },
    ],
    baseUrl: 'https://api.groq.com/openai/v1',
    authHeader: 'Bearer',
  },
  // Local AI Layer (#9) — Ollama runs models on the user's machine. No API
  // key, fully private (good for summarizing sensitive logs before any cloud
  // call). OpenAI-compatible endpoint at /v1. Set OLLAMA_BASE_URL to override.
  // Models listed are common pulls — run e.g. `ollama pull llama3.1` first;
  // getOllamaModels() can fetch the actually-installed set at runtime.
  ollama: {
    name: 'Ollama (local)',
    icon: '🦙',
    models: [
      { id: 'llama3.1', name: 'Llama 3.1 8B (local)', maxTokens: 128000 },
      { id: 'qwen2.5', name: 'Qwen 2.5 7B (local)', maxTokens: 32000 },
      { id: 'mistral', name: 'Mistral 7B (local)', maxTokens: 32000 },
      { id: 'deepseek-r1', name: 'DeepSeek R1 7B (local, reasoning)', maxTokens: 64000 },
      { id: 'phi3', name: 'Phi-3 (local)', maxTokens: 128000 },
    ],
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    authHeader: 'none',
  },
};

// ── Chat Completion ──
export async function chatCompletion(
  provider: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number; systemPrompt?: string }
): Promise<{ content: string; promptTokens: number; responseTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number; model: string; provider: string }> {
  const providerConfig = AI_PROVIDERS[provider];
  if (!providerConfig) throw new Error(`Unknown provider: ${provider}`);
  const keyless = providerConfig.authHeader === 'none'; // local providers (Ollama)
  if (!apiKey && !keyless) throw new Error(`No API key configured for ${providerConfig.name}. Add your key in Platform Settings → AI Providers.`);

  const temp = options?.temperature ?? 0.7;
  const maxTok = options?.maxTokens ?? 4096;

  // Anthropic uses a different API format
  if (provider === 'anthropic') {
    return callAnthropic(apiKey, model, messages, temp, maxTok, options?.systemPrompt);
  }

  // OpenAI-compatible API (OpenAI, DeepSeek, Kimi, Groq, and Ollama's /v1)
  return callOpenAICompatible(provider, providerConfig.baseUrl, apiKey, model, messages, temp, maxTok, options?.systemPrompt);
}

async function callOpenAICompatible(
  provider: string, baseUrl: string, apiKey: string, model: string,
  messages: { role: string; content: string }[], temperature: number, maxTokens: number, systemPrompt?: string
) {
  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`; // local Ollama needs none

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages: allMessages, temperature, max_tokens: maxTokens }),
    });
  } catch (e: any) {
    // Most common for Ollama: not running / unreachable.
    if (provider === 'ollama') throw new Error(`Cannot reach Ollama at ${baseUrl}. Is it running? (\`ollama serve\`)`);
    throw e;
  }

  if (!response.ok) {
    const err = await response.text();
    logger.error(`OpenAI-compatible API error (${provider}/${model}):`, err);
    throw new Error(`API error (${response.status}): ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    promptTokens: data.usage?.prompt_tokens || 0,
    responseTokens: data.usage?.completion_tokens || 0,
    model: data.model || model,
    provider,
  };
}

async function callAnthropic(
  apiKey: string, model: string,
  messages: { role: string; content: string }[], temperature: number, maxTokens: number, systemPrompt?: string
) {
  // Opus 4.7 / 4.8 reject temperature/top_p/top_k (400) — steer via prompting instead.
  const rejectsSampling = /opus-4-(7|8)/.test(model);
  // Adaptive thinking is supported on Opus 4.6/4.7/4.8 and Sonnet 4.6.
  const supportsAdaptiveThinking = /(opus-4-(6|7|8)|sonnet-4-6)/.test(model);

  const body: any = {
    model,
    max_tokens: maxTokens,
    messages: messages.map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })),
  };
  // System prompt as a cacheable block (prompt caching is GA — cache_control,
  // no beta header). Caches when the prefix is large enough; harmless otherwise.
  if (systemPrompt) {
    body.system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  }
  if (!rejectsSampling && typeof temperature === 'number') body.temperature = temperature;
  if (supportsAdaptiveThinking) body.thinking = { type: 'adaptive' };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error(`Anthropic API error (${model}):`, err);
    throw new Error(`API error (${response.status}): ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  // Concatenate all text blocks (thinking blocks are skipped — their text is
  // empty by default on Opus 4.7/4.8 anyway).
  const text = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
  return {
    content: text,
    promptTokens: data.usage?.input_tokens || 0,
    responseTokens: data.usage?.output_tokens || 0,
    cacheReadTokens: data.usage?.cache_read_input_tokens || 0,
    cacheWriteTokens: data.usage?.cache_creation_input_tokens || 0,
    model: data.model || model,
    provider: 'anthropic',
  };
}

// ── Key Storage (in-memory + DB fallback) ──
const keyCache: Record<string, string> = {};

export async function getProviderKey(provider: string): Promise<string> {
  // 1. Check env vars first
  const envMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    kimi: 'KIMI_API_KEY',
    grok: 'GROK_API_KEY',
    groq: 'GROQ_API_KEY',
  };
  const envKey = process.env[envMap[provider] || ''];
  if (envKey) return envKey;

  // 2. Check in-memory cache
  if (keyCache[provider]) return keyCache[provider];

  // 3. Check DB (dev_team_members preferences for CEO)
  try {
    const { db } = require('@vibestudio/database');
    const ceo = await db('dev_team_members').where({ role: 'ceo' }).first();
    if (ceo?.preferences) {
      const prefs = typeof ceo.preferences === 'string' ? JSON.parse(ceo.preferences) : ceo.preferences;
      const key = prefs?.ai_keys?.[provider];
      if (key) { keyCache[provider] = key; return key; }
    }
  } catch {}

  return '';
}

export async function setProviderKey(provider: string, apiKey: string, memberId: string): Promise<void> {
  keyCache[provider] = apiKey;
  try {
    const { db } = require('@vibestudio/database');
    const member = await db('dev_team_members').where({ id: memberId }).first();
    const prefs = typeof member?.preferences === 'string' ? JSON.parse(member.preferences || '{}') : (member?.preferences || {});
    if (!prefs.ai_keys) prefs.ai_keys = {};
    prefs.ai_keys[provider] = apiKey;
    await db('dev_team_members').where({ id: memberId }).update({ preferences: JSON.stringify(prefs) });
  } catch (err) {
    logger.error('Failed to save AI key to DB:', err);
  }
}

export async function getProviderStatus(): Promise<Record<string, { configured: boolean; provider: string; name: string; icon: string; models: any[] }>> {
  const result: Record<string, any> = {};
  for (const [id, config] of Object.entries(AI_PROVIDERS)) {
    const local = config.authHeader === 'none';
    const key = local ? '' : await getProviderKey(id);
    result[id] = {
      provider: id,
      name: config.name,
      icon: config.icon,
      models: config.models,
      // Local providers (Ollama) need no key — treat as configured; the call
      // fails clearly if the daemon isn't running.
      configured: local ? true : !!key,
      local,
    };
  }
  return result;
}

// Best-effort: list the models actually installed in a local Ollama, via its
// OpenAI-compatible GET /v1/models. Returns [] if Ollama isn't reachable.
export async function getOllamaModels(): Promise<{ id: string; name: string; maxTokens: number }[]> {
  const baseUrl = AI_PROVIDERS.ollama?.baseUrl || 'http://localhost:11434/v1';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${baseUrl}/models`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((m: any) => ({ id: m.id, name: m.id, maxTokens: 0 }));
  } catch {
    return [];
  }
}

// Local embeddings via Ollama's OpenAI-compatible /v1/embeddings (private, no
// cloud). Used by the memory-search service (Local AI Layer #9 / A2). Throws if
// Ollama is unreachable so callers can fall back to lexical search.
export async function embedTexts(
  texts: string[],
  opts: { baseUrl?: string; model?: string } = {},
): Promise<number[][]> {
  const baseUrl = opts.baseUrl || AI_PROVIDERS.ollama?.baseUrl || "http://localhost:11434/v1";
  const model = opts.model || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`Embeddings error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.data || []).map((d: any) => d.embedding as number[]);
}
