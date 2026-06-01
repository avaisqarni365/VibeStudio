/**
 * Platform-wide AI call logger.
 *
 * Writes one row to `dev_prompt_history` per AI invocation, regardless
 * of where in the codebase the call originated. Designed to be passed
 * to chatCompletion() so every Claude / OpenAI / DeepSeek / etc. call
 * is attributable on the per-user usage page.
 *
 * Usage:
 *   import { chatCompletion } from '@vibestudio/dev-portal';
 *   import { logAiCall } from '../../../domains/dev-portal/src/ai-call-logger';
 *
 *   const t0 = Date.now();
 *   const result = await chatCompletion(provider, key, model, messages);
 *   await logAiCall({
 *     aiOrigin: 'dev_portal_chat',
 *     provider,
 *     model,
 *     messages,
 *     result,
 *     durationMs: Date.now() - t0,
 *     actor: { userId: req.user.userId, email: req.user.email, role: req.user.roles?.[0], orgId },
 *     request: req,
 *   });
 *
 * Best-effort: a logging failure NEVER throws to the caller. The AI
 * answer goes back to the user even if we couldn't persist usage.
 */

import { createLogger } from '@vibestudio/logging';

const logger = createLogger({ service: 'ai-call-logger' });

export type AiOrigin =
  | 'dev_portal_chat'
  | 'prompt_builder'
  | 'ab_test'
  | 'memory_search'
  | 'bug_capture'
  | 'context_pack'
  | 'code_review'
  | 'other';

export interface LogAiCallParams {
  aiOrigin: AiOrigin;
  provider: string;
  model: string;
  /** The messages sent to the LLM (prompt content). */
  messages: { role: string; content: string }[];
  /** What chatCompletion() returned. */
  result: { content: string; promptTokens?: number; responseTokens?: number };
  /** Duration in milliseconds — we'll convert to seconds. */
  durationMs: number;
  /** Who triggered the call. */
  actor: {
    userId?: string | null;
    email?: string | null;
    role?: string | null;
    orgId?: string | null;
  };
  /** Express request (optional). Used to capture IP, user agent, etc. */
  request?: any;
  /** Free-form metadata. */
  metadata?: Record<string, any>;
  /** Failure mode: error message if chatCompletion threw. */
  errorMessage?: string;
  /** Optional title — defaults to first 80 chars of the prompt. */
  title?: string;
}

export async function logAiCall(params: LogAiCallParams): Promise<void> {
  try {
    const { db } = require('@vibestudio/database');
    const { generateId } = require('@vibestudio/utils');

    // First user message becomes the title + prompt body. System message
    // (if present) goes into metadata so we don't lose the framing but
    // don't double-charge the title.
    const userMsg = params.messages.find((m) => m.role === 'user');
    const systemMsg = params.messages.find((m) => m.role === 'system');
    const promptText = userMsg?.content || params.messages.map((m) => `[${m.role}] ${m.content}`).join('\n\n');
    const title = (params.title || promptText.slice(0, 80)).replace(/\s+/g, ' ').trim() || '(no prompt)';
    const responseSummary = (params.result.content || '').slice(0, 1000);

    // Browser / device parsing from the request, kept tiny — no UA-parser
    // dependency needed at this depth. The dev-portal AI route already
    // does the heavy lifting elsewhere; we keep what's free here.
    let deviceType: string | null = null;
    let os: string | null = null;
    let browser: string | null = null;
    let ipAddress: string | null = null;
    if (params.request) {
      const ua = String(params.request.headers?.['user-agent'] || '');
      ipAddress = (params.request.ip
        || params.request.headers?.['x-forwarded-for']
        || params.request.socket?.remoteAddress
        || null) as string | null;
      if (/mobile|iphone|android/i.test(ua)) deviceType = 'mobile';
      else if (/electron/i.test(ua)) deviceType = 'desktop';
      else deviceType = 'web';
      if (/windows/i.test(ua)) os = 'Windows';
      else if (/mac os/i.test(ua)) os = 'macOS';
      else if (/linux/i.test(ua)) os = 'Linux';
      else if (/android/i.test(ua)) os = 'Android';
      else if (/iphone|ipad/i.test(ua)) os = 'iOS';
      if (/edg\//i.test(ua)) browser = 'Edge';
      else if (/chrome\//i.test(ua)) browser = 'Chrome';
      else if (/firefox\//i.test(ua)) browser = 'Firefox';
      else if (/safari\//i.test(ua)) browser = 'Safari';
    }

    await db('dev_prompt_history').insert({
      id: generateId(),
      // dev-portal callers will set author_id explicitly via the route
      // handler; everyone else leaves it null and uses actor_* instead.
      author_id: null,
      project_id: null,
      task_id: null,
      template: params.aiOrigin,
      title,
      prompt: promptText,
      response_summary: responseSummary,
      status: params.errorMessage ? 'failed' : 'completed',
      model: params.model,
      provider: params.provider,
      ai_origin: params.aiOrigin,
      prompt_tokens: params.result.promptTokens || 0,
      response_tokens: params.result.responseTokens || 0,
      duration_seconds: Math.max(0, Math.round(params.durationMs / 1000)),
      device_type: deviceType,
      os,
      browser,
      ip_address: ipAddress,
      actor_user_id: params.actor.userId || null,
      actor_email: params.actor.email || null,
      actor_role: params.actor.role || null,
      actor_org_id: params.actor.orgId || null,
      metadata: JSON.stringify({
        ...(params.metadata || {}),
        ...(systemMsg ? { system_prompt: systemMsg.content.slice(0, 2000) } : {}),
        ...(params.errorMessage ? { error: params.errorMessage } : {}),
      }),
      created_at: new Date(),
      completed_at: new Date(),
    });
  } catch (e: any) {
    // Never let logging failure surface to the caller.
    logger.warn(`logAiCall failed: ${e?.message || e}`);
  }
}

/**
 * Convenience wrapper: take a chatCompletion call and wrap it with
 * automatic logging + duration measurement. The wrapped function has
 * the same return type as chatCompletion.
 */
export async function loggedChatCompletion(
  origin: AiOrigin,
  actor: LogAiCallParams['actor'],
  call: () => Promise<{ content: string; promptTokens: number; responseTokens: number; model: string; provider: string }>,
  context: {
    provider: string;
    model: string;
    messages: { role: string; content: string }[];
    request?: any;
    metadata?: Record<string, any>;
  },
): ReturnType<typeof call> {
  const t0 = Date.now();
  try {
    const result = await call();
    await logAiCall({
      aiOrigin: origin,
      provider: result.provider || context.provider,
      model: result.model || context.model,
      messages: context.messages,
      result,
      durationMs: Date.now() - t0,
      actor,
      request: context.request,
      metadata: context.metadata,
    });
    return result;
  } catch (err: any) {
    await logAiCall({
      aiOrigin: origin,
      provider: context.provider,
      model: context.model,
      messages: context.messages,
      result: { content: '', promptTokens: 0, responseTokens: 0 },
      durationMs: Date.now() - t0,
      actor,
      request: context.request,
      metadata: context.metadata,
      errorMessage: err?.message || String(err),
    });
    throw err;
  }
}
