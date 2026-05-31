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
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', maxTokens: 200000 },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', maxTokens: 1000000 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', maxTokens: 200000 },
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
};

// ── Chat Completion ──
export async function chatCompletion(
  provider: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number; systemPrompt?: string }
): Promise<{ content: string; promptTokens: number; responseTokens: number; model: string; provider: string }> {
  const providerConfig = AI_PROVIDERS[provider];
  if (!providerConfig) throw new Error(`Unknown provider: ${provider}`);
  if (!apiKey) throw new Error(`No API key configured for ${providerConfig.name}. Add your key in Platform Settings → AI Providers.`);

  const temp = options?.temperature ?? 0.7;
  const maxTok = options?.maxTokens ?? 4096;

  // Anthropic uses a different API format
  if (provider === 'anthropic') {
    return callAnthropic(apiKey, model, messages, temp, maxTok, options?.systemPrompt);
  }

  // OpenAI-compatible API (OpenAI, DeepSeek, Kimi all use the same format)
  return callOpenAICompatible(providerConfig.baseUrl, apiKey, model, messages, temp, maxTok, options?.systemPrompt);
}

async function callOpenAICompatible(
  baseUrl: string, apiKey: string, model: string,
  messages: { role: string; content: string }[], temperature: number, maxTokens: number, systemPrompt?: string
) {
  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: allMessages, temperature, max_tokens: maxTokens }),
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error(`OpenAI-compatible API error (${model}):`, err);
    throw new Error(`API error (${response.status}): ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    promptTokens: data.usage?.prompt_tokens || 0,
    responseTokens: data.usage?.completion_tokens || 0,
    model: data.model || model,
    provider: model.startsWith('deepseek') ? 'deepseek' : model.startsWith('moonshot') ? 'kimi' : 'openai',
  };
}

async function callAnthropic(
  apiKey: string, model: string,
  messages: { role: string; content: string }[], temperature: number, maxTokens: number, systemPrompt?: string
) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt || undefined,
      messages: messages.map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error(`Anthropic API error (${model}):`, err);
    throw new Error(`API error (${response.status}): ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return {
    content: data.content?.[0]?.text || '',
    promptTokens: data.usage?.input_tokens || 0,
    responseTokens: data.usage?.output_tokens || 0,
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
    const key = await getProviderKey(id);
    result[id] = {
      provider: id,
      name: config.name,
      icon: config.icon,
      models: config.models,
      configured: !!key,
    };
  }
  return result;
}
