import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createLogger } from '@vibestudio/logging';

const router = express.Router();
const logger = createLogger({ service: 'dev-portal-routes' });

const DEV_AUTH_COOKIE = 'dev_portal_token';

function setDevAuthCookie(res: any, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(DEV_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 60 * 60 * 1000, // match 1h access-token lifetime
    path: '/',
  });
}

function clearDevAuthCookie(res: any) {
  res.clearCookie(DEV_AUTH_COOKIE, { path: '/' });
}

function readDevCookie(req: any): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const raw of String(header).split(';')) {
    const trimmed = raw.trim();
    if (trimmed.startsWith(`${DEV_AUTH_COOKIE}=`)) {
      const value = trimmed.substring(DEV_AUTH_COOKIE.length + 1);
      try { return decodeURIComponent(value); } catch { return value; }
    }
  }
  return null;
}

function extractDevToken(req: any): string | null {
  const cookie = readDevCookie(req);
  if (cookie) return cookie;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7);
  return null;
}

async function recordDevSession(params: { req: any; devMemberId: string; token: string }) {
  try {
    const { db } = require('@vibestudio/database');
    if (!(await db.schema.hasTable('dev_sessions'))) return;
    const { req, devMemberId, token } = params;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const existing = await db('dev_sessions').where({ token_hash: tokenHash }).first();
    if (existing) {
      await db('dev_sessions').where({ id: existing.id }).update({
        is_active: true,
        last_activity_at: now,
        expires_at: expiresAt,
        revoked_at: null,
        revoked_reason: null,
        updated_at: now,
      });
      return;
    }
    await db('dev_sessions').insert({
      dev_member_id: devMemberId,
      platform: 'web',
      ip_address: req.ip || req.socket?.remoteAddress || null,
      user_agent: (req.headers['user-agent'] || '').substring(0, 500) || null,
      token_hash: tokenHash,
      is_active: true,
      expires_at: expiresAt,
      last_activity_at: now,
      created_at: now,
      updated_at: now,
    });
  } catch (err: any) {
    logger.warn('recordDevSession failed: ' + (err?.message || ''));
  }
}

async function revokeDevSession(token: string, reason: string) {
  try {
    const { db } = require('@vibestudio/database');
    if (!(await db.schema.hasTable('dev_sessions'))) return;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await db('dev_sessions')
      .where({ token_hash: tokenHash, is_active: true })
      .update({
        is_active: false,
        revoked_at: new Date(),
        revoked_reason: reason,
        updated_at: new Date(),
      });
  } catch (err: any) {
    logger.warn('revokeDevSession failed: ' + (err?.message || ''));
  }
}

async function isDevSessionRevoked(token: string): Promise<boolean> {
  try {
    const { db } = require('@vibestudio/database');
    if (!(await db.schema.hasTable('dev_sessions'))) return false;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await db('dev_sessions').where({ token_hash: tokenHash }).first();
    if (!row) return false; // allow unknown (pre-migration) tokens
    return row.is_active === false;
  } catch {
    return false;
  }
}

// Dev Portal has its OWN auth — separate from main ACCA auth.
// Accepts the httpOnly dev_portal_token cookie OR a legacy Bearer header.
function devAuth(req: any, res: any, next: any) {
  (async () => {
    try {
      const token = extractDevToken(req);
      if (!token) return res.status(401).json({ success: false, error: { code: 'NO_TOKEN', message: 'Dev portal token required' } });
      const jwt = require('jsonwebtoken');
      const { config } = require('@vibestudio/config');
      const jwtSecret = config.jwtSecret || process.env.JWT_SECRET;
      if (!jwtSecret) throw new Error('JWT_SECRET is not configured — refusing to use insecure fallback');
      const decoded = jwt.verify(token, jwtSecret);
      if (!decoded.isDevPortal) return res.status(403).json({ success: false, error: { code: 'NOT_DEV_PORTAL', message: 'This token is not for the dev portal' } });

      if (await isDevSessionRevoked(token)) {
        return res.status(401).json({ success: false, error: { code: 'SESSION_REVOKED', message: 'Session has been revoked. Please log in again.' } });
      }

      req.devUser = decoded;
      // Open the per-request transaction & set app.current_dev_member_id so
      // RLS policies on dev_* tables (when re-enabled) see the correct member.
      // All subsequent service queries via the default `db` import are routed
      // through this trx via AsyncLocalStorage.
      const { withRlsTransaction } = require('../middleware/data-isolation');
      return withRlsTransaction(req, res, next);
    } catch (err) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired dev portal token' } });
    }
  })();
}

// Like devAuth but WITHOUT opening the per-request RLS transaction — for
// long-lived responses (SSE) that must not hold a pooled DB connection open.
// Only mount on endpoints that don't read RLS-scoped tables.
function devAuthNoTx(req: any, res: any, next: any) {
  (async () => {
    try {
      const token = extractDevToken(req);
      if (!token) return res.status(401).json({ success: false, error: { code: 'NO_TOKEN', message: 'Dev portal token required' } });
      const jwt = require('jsonwebtoken');
      const { config } = require('@vibestudio/config');
      const jwtSecret = config.jwtSecret || process.env.JWT_SECRET;
      if (!jwtSecret) throw new Error('JWT_SECRET is not configured');
      const decoded = jwt.verify(token, jwtSecret);
      if (!decoded.isDevPortal) return res.status(403).json({ success: false, error: { code: 'NOT_DEV_PORTAL', message: 'This token is not for the dev portal' } });
      if (await isDevSessionRevoked(token)) return res.status(401).json({ success: false, error: { code: 'SESSION_REVOKED', message: 'Session has been revoked. Please log in again.' } });
      req.devUser = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired dev portal token' } });
    }
  })();
}

// Restrict certain actions to CEO and lead roles
function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!roles.includes(req.devUser?.role)) return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_ROLE', message: `Requires role: ${roles.join(', ')}` } });
    next();
  };
}

const { devPortalService } = require('../../../../domains/dev-portal/src/dev-portal-service');

// ── Security helpers ──

/** Verify channel membership; throws 403 payload if not a member. */
async function requireChannelMembership(channelId: string, memberId: string, res: any): Promise<boolean> {
  const { db } = require('@vibestudio/database');
  const row = await db('dev_channel_members').where({ channel_id: channelId, member_id: memberId }).first();
  if (!row) { res.status(403).json({ success: false, error: { code: 'NOT_CHANNEL_MEMBER', message: 'You are not a member of this channel' } }); return false; }
  return true;
}

/** Verify project membership via dev_project_members; throws 403 if not a member.
 *  The `ceo` role is the super-admin and bypasses membership (can enter any
 *  workspace) — this mirrors the RLS bypass in migration 087. */
async function requireProjectMembership(projectId: string, memberId: string, res: any, role?: string): Promise<boolean> {
  if (role === 'ceo') return true;
  const { db } = require('@vibestudio/database');
  const row = await db('dev_project_members').where({ project_id: projectId, member_id: memberId }).first();
  if (!row) { res.status(403).json({ success: false, error: { code: 'NOT_PROJECT_MEMBER', message: 'You are not a member of this project' } }); return false; }
  return true;
}

// Note: dev portal RLS context is now set automatically by `withRlsTransaction`
// (mounted from `devAuth`). The old `setDevRlsContext` helper used `SET LOCAL`
// outside an explicit transaction, which never persisted under knex's pool —
// removed in favor of the request-scoped trx pattern.

// ── Auth ──
router.post('/auth/login', async (req, res) => {
  try {
    const result = await devPortalService.login(req.body.email, req.body.password);
    if (!result.success) return res.status(401).json(result);
    // B-5: set httpOnly cookie and record the session for revocation support.
    const token = (result as any)?.data?.token;
    const devMemberId = (result as any)?.data?.user?.id;
    if (token) {
      setDevAuthCookie(res, token);
      if (devMemberId) {
        await recordDevSession({ req, devMemberId, token });
      }
    }
    res.json(result);
  } catch (error) { logger.error('Dev portal login error', error as Error); res.status(500).json({ success: false, error: { code: 'LOGIN_ERROR', message: 'Login failed' } }); }
});

router.get('/auth/me', devAuth, async (req: any, res) => {
  try {
    const user = await devPortalService.getMe(req.devUser.devMemberId);
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    res.json({ success: true, data: user });
  } catch (error) { logger.error('Dev portal me error', error as Error); res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get user' } }); }
});

/**
 * GET /dev-portal/me/usage
 *
 * Personal Claude / AI usage page data. Returns the logged-in dev-team
 * member's prompts across EVERY origin (dev-portal chat, AI bookkeeping,
 * tax advisor, voice agent, vendor learning, etc.) — anywhere they
 * triggered an LLM call on the platform.
 *
 * Matching rule (most-permissive of):
 *   - dev_prompt_history.author_id  = devMemberId (dev-portal chat)
 *   - dev_prompt_history.actor_email = the dev member's email
 *     (covers calls made while logged into the main /login app with the
 *      same email — actor_email is set by the platform-wide logger).
 *
 * Query params:
 *   range = 'today' | 'week' | 'month' | 'all'  (default 'month')
 *   origin = optional AI origin filter (dev_portal_chat | ai_bookkeeping | …)
 *   provider = optional provider filter (anthropic | openai | …)
 *   limit = number of recent rows (default 50, max 500)
 */
router.get('/me/usage', devAuth, async (req: any, res) => {
  try {
    const { db } = require('@vibestudio/database');
    const me = await devPortalService.getMe(req.devUser.devMemberId);
    if (!me) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

    const range = String(req.query.range || 'month');
    const origin = req.query.origin ? String(req.query.origin) : null;
    const provider = req.query.provider ? String(req.query.provider) : null;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 500);

    let since: Date | null = new Date();
    if (range === 'today') since.setHours(0, 0, 0, 0);
    else if (range === 'week') since.setDate(since.getDate() - 7);
    else if (range === 'month') since.setMonth(since.getMonth() - 1);
    else since = null;

    const filterWhere = (q: any) => {
      q.where(function (this: any) {
        this.where('author_id', me.id).orWhere('actor_email', me.email);
      });
      if (since) q.andWhere('created_at', '>=', since);
      if (origin) q.andWhere('ai_origin', origin);
      if (provider) q.andWhere('provider', provider);
    };

    // ── Totals ──────────────────────────────────────────────────
    const totalsRow = await db('dev_prompt_history')
      .modify(filterWhere)
      .select(
        db.raw('COUNT(*)::int as total'),
        db.raw('COALESCE(SUM(prompt_tokens), 0)::int as prompt_tokens'),
        db.raw('COALESCE(SUM(response_tokens), 0)::int as response_tokens'),
        db.raw('COALESCE(SUM(cache_read_tokens), 0)::int as cache_read_tokens'),
        db.raw('COALESCE(SUM(cache_write_tokens), 0)::int as cache_write_tokens'),
        db.raw('COALESCE(SUM(duration_seconds), 0)::int as total_duration_seconds'),
        db.raw("COUNT(*) FILTER (WHERE status = 'failed')::int as failed"),
      )
      .first();

    // ── Breakdowns ──────────────────────────────────────────────
    const byOrigin = await db('dev_prompt_history')
      .modify(filterWhere)
      .select('ai_origin')
      .count({ count: 'id' })
      .groupBy('ai_origin')
      .orderBy('count', 'desc');

    const byProvider = await db('dev_prompt_history')
      .modify(filterWhere)
      .select('provider')
      .count({ count: 'id' })
      .sum({ in_tokens: 'prompt_tokens', out_tokens: 'response_tokens' })
      .groupBy('provider')
      .orderBy('count', 'desc');

    const byModel = await db('dev_prompt_history')
      .modify(filterWhere)
      .select('model')
      .count({ count: 'id' })
      .sum({ in_tokens: 'prompt_tokens', out_tokens: 'response_tokens', cache_read: 'cache_read_tokens', cache_write: 'cache_write_tokens' })
      .groupBy('model')
      .orderBy('count', 'desc');

    const byDevice = await db('dev_prompt_history')
      .modify(filterWhere)
      .select('device_type', 'os', 'browser')
      .count({ count: 'id' })
      .groupBy('device_type', 'os', 'browser')
      .orderBy('count', 'desc');

    // ── Per-day series for the chart ────────────────────────────
    const daily = await db('dev_prompt_history')
      .modify(filterWhere)
      .select(db.raw("to_char(created_at, 'YYYY-MM-DD') as day"))
      .count({ count: 'id' })
      .sum({ in_tokens: 'prompt_tokens', out_tokens: 'response_tokens' })
      .groupBy('day')
      .orderBy('day', 'asc');

    // ── Recent prompts ──────────────────────────────────────────
    const recent = await db('dev_prompt_history')
      .modify(filterWhere)
      .select(
        'id', 'title', 'ai_origin', 'provider', 'model',
        'prompt_tokens', 'response_tokens', 'cache_read_tokens', 'cache_write_tokens', 'duration_seconds',
        'status', 'device_type', 'os', 'browser', 'ip_address',
        'actor_email', 'actor_role',
        'created_at',
      )
      .orderBy('created_at', 'desc')
      .limit(limit);

    res.json({
      success: true,
      data: {
        me: { id: me.id, email: me.email, name: me.name, role: me.role },
        range,
        totals: totalsRow || { total: 0, prompt_tokens: 0, response_tokens: 0, total_duration_seconds: 0, failed: 0 },
        breakdowns: { byOrigin, byProvider, byModel, byDevice },
        daily,
        recent,
      },
    });
  } catch (error: any) {
    logger.error('Dev portal usage error', error);
    res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to load usage' } });
  }
});

/**
 * GET /dev-portal/me/usage/:id — full body of a single prompt the user owns.
 */
router.get('/me/usage/:id', devAuth, async (req: any, res) => {
  try {
    const { db } = require('@vibestudio/database');
    const me = await devPortalService.getMe(req.devUser.devMemberId);
    if (!me) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    const row = await db('dev_prompt_history').where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prompt not found' } });
    // Access check: must be the same user (by member id OR matching email).
    if (row.author_id !== me.id && (row.actor_email || '').toLowerCase() !== (me.email || '').toLowerCase()) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not your prompt' } });
    }
    res.json({ success: true, data: row });
  } catch (error: any) {
    logger.error('Dev portal usage detail error', error);
    res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to load prompt' } });
  }
});

router.post('/auth/refresh', async (req: any, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ success: false, error: { code: 'NO_REFRESH_TOKEN', message: 'refresh_token is required' } });
    const crypto = require('crypto');
    const jwt = require('jsonwebtoken');
    const { config } = require('@vibestudio/config');
    const { db } = require('@vibestudio/database');
    const jwtSecret = config.jwtSecret || process.env.JWT_SECRET;
    if (!jwtSecret) return res.status(500).json({ success: false, error: { code: 'CONFIG_ERROR', message: 'JWT_SECRET not configured' } });
    const hash = crypto.createHash('sha256').update(refresh_token).digest('hex');
    const member = await db('dev_team_members').where({ refresh_token_hash: hash }).first();
    if (!member) return res.status(401).json({ success: false, error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' } });
    const accessToken = jwt.sign({ devMemberId: member.id, email: member.email, role: member.role, name: member.name, isDevPortal: true }, jwtSecret, { expiresIn: '1h' });
    const newRefresh = crypto.randomBytes(48).toString('hex');
    const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
    await db('dev_team_members').where({ id: member.id }).update({ refresh_token_hash: newHash });
    // B-5: rotate the dev_sessions row and cookie alongside the token pair.
    const oldToken = extractDevToken(req);
    if (oldToken && oldToken !== accessToken) {
      await revokeDevSession(oldToken, 'refreshed');
    }
    setDevAuthCookie(res, accessToken);
    await recordDevSession({ req, devMemberId: member.id, token: accessToken });
    res.json({ success: true, data: { token: accessToken, refresh_token: newRefresh } });
  } catch (error) { logger.error('Dev portal refresh error', error as Error); res.status(500).json({ success: false, error: { code: 'REFRESH_ERROR', message: 'Token refresh failed' } }); }
});

router.post('/auth/logout', devAuth, async (req: any, res) => {
  try {
    const { db } = require('@vibestudio/database');
    await db('dev_team_members').where({ id: req.devUser.devMemberId }).update({ refresh_token_hash: null });
    // B-5: revoke the session row for this token and clear the cookie.
    const token = extractDevToken(req);
    if (token) await revokeDevSession(token, 'logout');
    clearDevAuthCookie(res);
    res.json({ success: true });
  } catch (error) {
    clearDevAuthCookie(res);
    res.status(500).json({ success: false, error: { code: 'LOGOUT_ERROR', message: 'Logout failed' } });
  }
});

// ── Team ──
router.get('/team', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.listMembers(req.query) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list team' } }); }
});

router.post('/team', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try {
    if (!req.body.email || !req.body.name) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'email and name are required' } });
    if (!req.body.password || req.body.password.length < 10) return res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 10 characters' } });
    const result = await devPortalService.createMember(req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error?.code === '23505' || error?.message?.includes('unique') || error?.message?.includes('duplicate')) {
      return res.status(409).json({ success: false, error: { code: 'EMAIL_TAKEN', message: 'A member with this email already exists' } });
    }
    res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to create member' } });
  }
});

router.get('/team/workload', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getTeamWorkloadSummary() }); }
  catch (error) { logger.error('Team workload error', error as Error); res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get team workload' } }); }
});

router.get('/team/:id', devAuth, async (req: any, res) => {
  try {
    const member = await devPortalService.getMember(req.params.id);
    if (!member) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found' } });
    res.json({ success: true, data: member });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get member' } }); }
});

router.put('/team/:id', devAuth, async (req: any, res) => {
  try {
    const isSelf = req.devUser.devMemberId === req.params.id;
    const isAdmin = ['ceo', 'lead'].includes(req.devUser.role);
    if (!isSelf && !isAdmin) return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_ROLE', message: 'You can only edit your own profile or must be ceo/lead' } });
    res.json({ success: true, data: await devPortalService.updateMember(req.params.id, req.body) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update member' } }); }
});

router.get('/team/:id/workload', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getMemberWorkload(req.params.id) }); }
  catch (error) { logger.error('Member workload error', error as Error); res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get member workload' } }); }
});

router.get('/team/:id/activity', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getMemberActivity(req.params.id, Number(req.query.limit) || 30) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get member activity' } }); }
});

// ── Projects ──
router.get('/projects', devAuth, async (req: any, res) => {
  // Scoped: ceo (super-admin) sees all; everyone else sees only their linked projects.
  try { res.json({ success: true, data: await devPortalService.listProjects(req.devUser.devMemberId, req.devUser.role) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list projects' } }); }
});

router.get('/active-project', devAuth, async (req: any, res) => {
  // Resolve to a project the viewer can actually enter (their linked workspace),
  // so login always lands somewhere valid.
  try { res.json({ success: true, data: { active_project_id: await devPortalService.resolveActiveProjectId(req.devUser.devMemberId, req.devUser.role) } }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed' } }); }
});

router.put('/active-project', devAuth, async (req: any, res) => {
  try {
    const projectId = req.body.project_id;
    // Can't switch into a workspace you can't see (non-ceo, non-member).
    const visible = await devPortalService.visibleProjectIds(req.devUser.devMemberId, req.devUser.role);
    if (!projectId || !visible.includes(projectId)) {
      return res.status(403).json({ success: false, error: { code: 'NOT_PROJECT_MEMBER', message: 'You cannot switch to a project you are not a member of' } });
    }
    res.json({ success: true, data: await devPortalService.setActiveProjectId(req.devUser.devMemberId, projectId) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed' } }); }
});

router.post('/projects', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Project name is required' } });
    if (req.body.key && !/^[A-Z0-9]{1,10}$/.test(req.body.key)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_KEY', message: 'Project key must be 1-10 uppercase alphanumeric characters' } });
    }
    const result = await devPortalService.createProject(req.body, req.devUser.devMemberId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error?.code === '23505' || error?.message?.includes('unique') || error?.message?.includes('duplicate')) {
      return res.status(409).json({ success: false, error: { code: 'KEY_TAKEN', message: 'A project with this key already exists' } });
    }
    res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to create project' } });
  }
});

router.put('/projects/:projectId', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.updateProject(req.params.projectId, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update project' } }); }
});

// Generate (or relink) the filesystem context pack for a project → projects/<slug>/
router.post('/projects/:projectId/pack', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try {
    const data = await devPortalService.createProjectPack(req.params.projectId, { ...req.body, actorId: req.devUser.devMemberId });
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to create project pack' } });
  }
});

router.get('/projects/:projectId/members', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getProjectMembers(req.params.projectId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get members' } }); }
});

router.post('/projects/:projectId/members', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.addProjectMember(req.params.projectId, req.body.member_id, req.body.role, req.body.allocation_percent) }); }
  catch (error: any) { res.status(400).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to add member' } }); }
});

router.delete('/projects/:projectId/members/:memberId', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.removeProjectMember(req.params.projectId, req.params.memberId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to remove member' } }); }
});

router.put('/projects/:projectId/members/:memberId', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.updateProjectMember(req.params.projectId, req.params.memberId, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update member' } }); }
});

router.get('/portfolio', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getPortfolioStats(req.devUser.devMemberId, req.devUser.role) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get portfolio' } }); }
});

// ── Sprints ──
router.get('/projects/:projectId/sprints', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.listSprints(req.params.projectId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list sprints' } }); }
});

router.post('/projects/:projectId/sprints', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.createSprint(req.params.projectId, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to create sprint' } }); }
});

router.put('/sprints/:id', devAuth, requireRole('ceo', 'lead', 'scrum_master'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.updateSprint(req.params.id, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update sprint' } }); }
});

router.get('/sprints/:id/tasks', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getSprintTasks(req.params.id) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get sprint tasks' } }); }
});

router.get('/sprints/:id/stats', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getSprintStats(req.params.id) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get sprint stats' } }); }
});

router.get('/projects/:projectId/active-sprint', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getActiveSprint(req.params.projectId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get active sprint' } }); }
});

router.post('/tasks/:id/time-log', devAuth, async (req: any, res) => {
  try {
    const hours = Number(req.body.hours);
    if (!hours || hours <= 0 || hours > 24) return res.status(400).json({ success: false, error: { code: 'INVALID_HOURS', message: 'hours must be between 0 and 24' } });
    const task = await devPortalService.getTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    if (task.project_id && !await requireProjectMembership(task.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: await devPortalService.logTimeOnTask(req.params.id, hours, req.devUser.devMemberId) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to log time' } }); }
});

router.post('/sprints/:id/bulk-move', devAuth, async (req: any, res) => {
  try {
    const taskIds: string[] = req.body.task_ids || [];
    if (taskIds.length > 0) {
      const { db } = require('@vibestudio/database');
      // Find the sprint's project_id (null = backlog — skip check)
      const sprintId = req.params.id === 'backlog' ? null : req.params.id;
      if (sprintId) {
        const sprint = await db('dev_sprints').where({ id: sprintId }).first();
        if (sprint?.project_id) {
          if (!await requireProjectMembership(sprint.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
          // Ensure all tasks belong to this project
          const tasks = await db('dev_tasks').whereIn('id', taskIds).select('project_id');
          const crossProject = tasks.some((t: any) => t.project_id && t.project_id !== sprint.project_id);
          if (crossProject) return res.status(403).json({ success: false, error: { code: 'CROSS_PROJECT', message: 'All tasks must belong to the sprint project' } });
        }
      }
    }
    await devPortalService.bulkMoveToSprint(taskIds, req.params.id === 'backlog' ? null : req.params.id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to move tasks' } }); }
});

// ── Tasks ──
router.get('/projects/:projectId/tasks', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.listTasks(req.params.projectId, req.query) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list tasks' } }); }
});

router.post('/projects/:projectId/tasks', devAuth, async (req: any, res) => {
  try {
    if (!await requireProjectMembership(req.params.projectId, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: await devPortalService.createTask(req.params.projectId, req.body, req.devUser.devMemberId) });
  } catch (error) { logger.error('Create task error', error as Error); res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to create task' } }); }
});

router.get('/tasks/:id', devAuth, async (req: any, res) => {
  try {
    const task = await devPortalService.getTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    if (task.project_id && !await requireProjectMembership(task.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: task });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get task' } }); }
});

router.put('/tasks/:id', devAuth, async (req: any, res) => {
  try {
    const task = await devPortalService.getTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    if (task.project_id && !await requireProjectMembership(task.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: await devPortalService.updateTask(req.params.id, req.body, req.devUser.devMemberId) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update task' } }); }
});

// ── Comments ──
router.post('/tasks/:id/comments', devAuth, async (req: any, res) => {
  try {
    const task = await devPortalService.getTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    if (task.project_id && !await requireProjectMembership(task.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: await devPortalService.addComment(req.params.id, req.devUser.devMemberId, req.body.content, req.body.type) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to add comment' } }); }
});

// ── A4: task ↔ commit/PR/CI links ──
router.get('/tasks/:id/links', devAuth, async (req: any, res) => {
  try {
    const task = await devPortalService.getTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    if (task.project_id && !await requireProjectMembership(task.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: await devPortalService.getTaskLinks(req.params.id) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get task links' } }); }
});

router.post('/tasks/:id/links', devAuth, async (req: any, res) => {
  try {
    const task = await devPortalService.getTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    if (task.project_id && !await requireProjectMembership(task.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: await devPortalService.upsertTaskLink(req.params.id, req.body, req.devUser.devMemberId) });
  } catch (error: any) { res.status(400).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to add link' } }); }
});

router.delete('/task-links/:id', devAuth, async (req: any, res) => {
  try {
    const { db } = require('@vibestudio/database');
    const link = await db('dev_task_links').where({ id: req.params.id }).first();
    if (!link) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found' } });
    const task = await devPortalService.getTask(link.task_id);
    if (task?.project_id && !await requireProjectMembership(task.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: await devPortalService.deleteTaskLink(req.params.id) });
  } catch (error: any) { res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to delete link' } }); }
});

// ── Dashboard ──
router.get('/projects/:projectId/dashboard', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getDashboardStats(req.params.projectId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get dashboard' } }); }
});

// ── Activity ──
router.get('/projects/:projectId/activity', devAuth, async (req: any, res) => {
  try {
    const result = await devPortalService.getActivity(
      req.params.projectId,
      Number(req.query.limit) || 50,
      req.query.cursor as string | undefined,
    );
    res.json({ success: true, data: result });
  }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get activity' } }); }
});

// ── Wiki ──
router.get('/projects/:projectId/wiki', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.listWikiPages(req.params.projectId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list wiki' } }); }
});

router.post('/projects/:projectId/wiki', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.createWikiPage(req.params.projectId, req.body, req.devUser.devMemberId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to create wiki page' } }); }
});

router.get('/wiki/:id', devAuth, async (req: any, res) => {
  try {
    const page = await devPortalService.getWikiPage(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Wiki page not found' } });
    if (page.project_id && !await requireProjectMembership(page.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: page });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get wiki page' } }); }
});

router.put('/wiki/:id', devAuth, async (req: any, res) => {
  try {
    const page = await devPortalService.getWikiPage(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Wiki page not found' } });
    if (page.project_id && !await requireProjectMembership(page.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: await devPortalService.updateWikiPage(req.params.id, req.body, req.devUser.devMemberId) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update wiki page' } }); }
});

router.delete('/wiki/:id', devAuth, requireRole('ceo', 'lead', 'product_owner'), async (req: any, res) => {
  try {
    const page = await devPortalService.getWikiPage(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Wiki page not found' } });
    if (page.project_id && !await requireProjectMembership(page.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: await devPortalService.deleteWikiPage(req.params.id, req.devUser.devMemberId) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to delete wiki page' } }); }
});

router.post('/projects/:projectId/wiki/generate-domains', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.generateDomainWikiPages(req.params.projectId, req.devUser.devMemberId) }); }
  catch (error) { logger.error('Wiki generate error', error as Error); res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to generate domain wiki pages' } }); }
});

router.post('/projects/:projectId/wiki/sync-project', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.generateProjectWikiPages(req.params.projectId, req.devUser.devMemberId) }); }
  catch (error) { logger.error('Wiki sync error', error as Error); res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to sync project wiki pages' } }); }
});

router.get('/project-scan', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.scanProject() }); }
  catch (error) { logger.error('Project scan error', error as Error); res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to scan project' } }); }
});

// ── Spaces ──
router.get('/spaces', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.listSpaces() }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list spaces' } }); }
});

router.post('/spaces', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.createSpace(req.body, req.devUser.devMemberId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to create space' } }); }
});

router.put('/spaces/:id', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.updateSpace(req.params.id, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update space' } }); }
});

// ── Lists ──
router.get('/spaces/:spaceId/lists', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.listsBySpace(req.params.spaceId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list lists' } }); }
});

router.post('/spaces/:spaceId/lists', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.createList(req.params.spaceId, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to create list' } }); }
});

router.put('/lists/:id', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.updateList(req.params.id, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update list' } }); }
});

// ── Docs ──
router.get('/spaces/:spaceId/docs', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.listDocs(req.params.spaceId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list docs' } }); }
});

router.get('/docs/:id', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getDoc(req.params.id) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get doc' } }); }
});

router.post('/spaces/:spaceId/docs', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.createDoc(req.params.spaceId, req.body, req.devUser.devMemberId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to create doc' } }); }
});

router.put('/docs/:id', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.updateDoc(req.params.id, req.body, req.devUser.devMemberId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update doc' } }); }
});

// ── Channels & Messages ──
router.get('/channels', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.listChannels(req.devUser.devMemberId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list channels' } }); }
});

router.post('/channels', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.createChannel(req.body, req.devUser.devMemberId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to create channel' } }); }
});

router.get('/channels/:id/messages', devAuth, async (req: any, res) => {
  try {
    if (!await requireChannelMembership(req.params.id, req.devUser.devMemberId, res)) return;
    res.json({ success: true, data: await devPortalService.getChannelMessages(req.params.id, Number(req.query.limit) || 50, req.query.before as string) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get messages' } }); }
});

router.post('/channels/:id/messages', devAuth, async (req: any, res) => {
  try {
    if (!await requireChannelMembership(req.params.id, req.devUser.devMemberId, res)) return;
    res.json({ success: true, data: await devPortalService.sendMessage(req.params.id, req.devUser.devMemberId, req.body.content, req.body.type, req.body.reply_to_id) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to send message' } }); }
});

router.put('/channels/:id/read', devAuth, async (req: any, res) => {
  try {
    if (!await requireChannelMembership(req.params.id, req.devUser.devMemberId, res)) return;
    await devPortalService.markChannelRead(req.params.id, req.devUser.devMemberId); res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to mark read' } }); }
});

// ── Inbox ──
router.get('/inbox', devAuth, async (req: any, res) => {
  try {
    const result = await devPortalService.getInbox(req.devUser.devMemberId, {
      is_read: req.query.is_read as string | undefined,
      cursor: req.query.cursor as string | undefined,
      limit: req.query.limit as string | undefined,
    });
    res.json({ success: true, data: result });
  }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get inbox' } }); }
});

router.get('/inbox/count', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: { count: await devPortalService.getInboxCount(req.devUser.devMemberId) } }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get inbox count' } }); }
});

router.put('/inbox/read', devAuth, async (req: any, res) => {
  try { await devPortalService.markInboxRead(req.devUser.devMemberId, req.body.inbox_id); res.json({ success: true }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to mark read' } }); }
});

// ── Favorites ──
router.get('/favorites', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getFavorites(req.devUser.devMemberId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get favorites' } }); }
});

router.post('/favorites', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.addFavorite(req.devUser.devMemberId, req.body.target_type, req.body.target_id, req.body.target_name) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to add favorite' } }); }
});

router.delete('/favorites/:id', devAuth, async (req: any, res) => {
  try { await devPortalService.removeFavorite(req.params.id, req.devUser.devMemberId); res.json({ success: true }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to remove favorite' } }); }
});

// ── Bookmarks ──
router.get('/bookmarks', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getBookmarks(req.devUser.devMemberId, req.query.space_id as string) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get bookmarks' } }); }
});

router.post('/bookmarks', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.addBookmark(req.devUser.devMemberId, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to add bookmark' } }); }
});

router.delete('/bookmarks/:id', devAuth, async (req: any, res) => {
  try { await devPortalService.removeBookmark(req.params.id, req.devUser.devMemberId); res.json({ success: true }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to remove bookmark' } }); }
});

// ── Project Docs (live .md file browser + editor) ──
const REPO_ROOT = process.cwd();
const USER_HOME = process.env.USERPROFILE || process.env.HOME || '';
// Claude Code stores per-project state under ~/.claude/projects/<slug>/, where
// <slug> is the absolute repo path with drive colon + separators replaced by '-'
// (e.g. D:\VibeStudio -> D--VibeStudio). Derive it from REPO_ROOT so VibeStudio
// always reads its OWN memory, never another project's.
const PROJECT_SLUG = REPO_ROOT.replace(/[:\\/]+/g, '-');
const MEMORY_DIR = path.join(USER_HOME, '.claude', 'projects', PROJECT_SLUG, 'memory');

function scanMdFiles(): { filename: string; dir: string; fullPath: string; size: number; category: string }[] {
  const results: { filename: string; dir: string; fullPath: string; size: number; category: string }[] = [];
  const scanDir = (dir: string, category: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (e.isFile() && e.name.endsWith('.md')) {
          const stat = fs.statSync(full);
          results.push({ filename: e.name, dir: path.relative(REPO_ROOT, dir).replace(/\\/g, '/') || '.', fullPath: full, size: stat.size, category });
        }
        if (e.isDirectory() && category === 'docs' && !['node_modules', 'dist', '.next', '.git'].includes(e.name)) {
          scanDir(full, category);
        }
      }
    } catch {}
  };
  // Scan project root
  scanDir(REPO_ROOT, 'root');
  // Scan docs/
  scanDir(path.join(REPO_ROOT, 'docs'), 'docs');
  // Scan docs/blueprints/
  scanDir(path.join(REPO_ROOT, 'docs', 'blueprints'), 'docs');
  // Scan memory dir
  if (fs.existsSync(MEMORY_DIR)) scanDir(MEMORY_DIR, 'memory');
  return results;
}

// List all .md files
router.get('/project-files', devAuth, async (req: any, res) => {
  try {
    const files = scanMdFiles().map(f => ({ filename: f.filename, dir: f.dir, category: f.category, size: f.size, sizeKB: Math.round(f.size / 1024) }));
    res.json({ success: true, data: files });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'ERROR', message: `Failed to scan: ${error?.message}` } });
  }
});

// Read a specific .md file
router.get('/project-files/:filename', devAuth, async (req: any, res) => {
  try {
    const filename = req.params.filename;
    const all = scanMdFiles();
    const match = all.find(f => f.filename === filename);
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `File not found: ${filename}` } });
    const content = fs.readFileSync(match.fullPath, 'utf-8');
    res.json({ success: true, data: { filename: match.filename, dir: match.dir, category: match.category, content, size: content.length, lines: content.split('\n').length } });
  } catch (error: any) {
    logger.error('Doc read error', error);
    res.status(500).json({ success: false, error: { code: 'ERROR', message: `Failed to read: ${error?.message}` } });
  }
});

// Save/edit a .md file
router.put('/project-files/:filename', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try {
    const filename = req.params.filename;
    const all = scanMdFiles();
    const match = all.find(f => f.filename === filename);
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `File not found: ${filename}` } });
    fs.writeFileSync(match.fullPath, req.body.content, 'utf-8');
    logger.info(`Project file updated: ${filename} by ${req.devUser.name}`);
    res.json({ success: true, data: { filename, saved: true, size: req.body.content.length } });
  } catch (error: any) {
    logger.error('Doc write error', error);
    res.status(500).json({ success: false, error: { code: 'ERROR', message: `Failed to save: ${error?.message}` } });
  }
});

// ── Prompt History ──
function parseDevice(req: any) {
  const ua = req.headers['user-agent'] || '';
  let os = 'Unknown', browser = ua.substring(0, 100), deviceType = 'desktop';
  if (ua.includes('Windows')) os = 'Windows ' + (ua.match(/Windows NT ([\d.]+)/)?.[1] || '');
  else if (ua.includes('Mac OS')) os = 'macOS ' + (ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') || '');
  else if (ua.includes('Linux')) os = 'Linux';
  if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) deviceType = 'mobile';
  if (ua.includes('Electron')) deviceType = 'desktop-app';
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const hostname = req.headers['x-hostname'] || req.hostname || '';
  return { os, browser, device_type: deviceType, ip_address: ip, hostname, device_name: req.body?.device_name || req.headers['x-device-name'] || null };
}

router.get('/projects/:projectId/prompts', devAuth, async (req: any, res) => {
  try {
    if (!await requireProjectMembership(req.params.projectId, req.devUser.devMemberId, res, req.devUser.role)) return;
    // Only return own prompts + shared prompts
    const prompts = await devPortalService.listPrompts(req.params.projectId, req.query);
    const filtered = (prompts || []).filter((p: any) => p.member_id === req.devUser.devMemberId || p.is_shared);
    res.json({ success: true, data: filtered });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list prompts' } }); }
});

router.get('/projects/:projectId/prompt-stats', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getPromptStats(req.params.projectId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get prompt stats' } }); }
});

// Cost-per-feature ROI (A7): AI spend joined to tasks/sprints for this project.
// Project-scoped read-only analytics — gated by devAuth + DB RLS only, matching
// the sibling `/prompt-stats` endpoint (the seed leaves `dev_project_members`
// empty, so a membership gate would make all project analytics unreachable).
router.get('/projects/:projectId/cost-roi', devAuth, async (req: any, res) => {
  try {
    res.json({ success: true, data: await devPortalService.getProjectCostRoi(req.params.projectId) });
  } catch (error) { logger.error('Cost ROI error', error as Error); res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to compute cost ROI' } }); }
});

// ── A3: prompt A/B experiments ──
// Resolve an experiment + enforce membership via its project. Returns the
// experiment row, or null after having already sent a 404/403 response.
async function experimentMembership(experimentId: string, req: any, res: any) {
  const { db } = require('@vibestudio/database');
  const exp = await db('dev_prompt_experiments').where({ id: experimentId }).first();
  if (!exp) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Experiment not found' } }); return null; }
  if (exp.project_id && !await requireProjectMembership(exp.project_id, req.devUser.devMemberId, res, req.devUser.role)) return null;
  return exp;
}

router.post('/projects/:projectId/experiments', devAuth, async (req: any, res) => {
  if (!await requireProjectMembership(req.params.projectId, req.devUser.devMemberId, res, req.devUser.role)) return;
  try { res.json({ success: true, data: await devPortalService.createExperiment(req.params.projectId, req.body, req.devUser.devMemberId) }); }
  catch (error: any) { res.status(400).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to create experiment' } }); }
});

router.get('/projects/:projectId/experiments', devAuth, async (req: any, res) => {
  if (!await requireProjectMembership(req.params.projectId, req.devUser.devMemberId, res, req.devUser.role)) return;
  try { res.json({ success: true, data: await devPortalService.listExperiments(req.params.projectId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list experiments' } }); }
});

router.get('/experiments/:id', devAuth, async (req: any, res) => {
  if (!await experimentMembership(req.params.id, req, res)) return;
  try { res.json({ success: true, data: await devPortalService.getExperiment(req.params.id) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get experiment' } }); }
});

router.delete('/experiments/:id', devAuth, async (req: any, res) => {
  if (!await experimentMembership(req.params.id, req, res)) return;
  try { res.json({ success: true, data: await devPortalService.deleteExperiment(req.params.id) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to delete experiment' } }); }
});

router.post('/experiments/:id/decide', devAuth, async (req: any, res) => {
  if (!await experimentMembership(req.params.id, req, res)) return;
  try { res.json({ success: true, data: await devPortalService.decideExperimentWinner(req.params.id, req.body?.variant_id) }); }
  catch (error: any) { res.status(400).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to set winner' } }); }
});

router.post('/experiments/:id/variants/:variantId/run', devAuth, async (req: any, res) => {
  if (!await experimentMembership(req.params.id, req, res)) return;
  try { res.json({ success: true, data: await devPortalService.runVariant(req.params.variantId, req.body || {}, req.devUser.devMemberId) }); }
  catch (error: any) { res.status(400).json({ success: false, error: { code: 'RUN_FAILED', message: error?.message || 'Run failed' } }); }
});

router.post('/variants/:variantId/rate', devAuth, async (req: any, res) => {
  try {
    const { db } = require('@vibestudio/database');
    const variant = await db('dev_prompt_variants').where({ id: req.params.variantId }).first();
    if (!variant) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Variant not found' } });
    if (!await experimentMembership(variant.experiment_id, req, res)) return;
    res.json({ success: true, data: await devPortalService.rateVariant(req.params.variantId, req.body?.rating) });
  } catch (error: any) { res.status(400).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to rate' } }); }
});

router.post('/projects/:projectId/prompts', devAuth, async (req: any, res) => {
  try {
    const deviceInfo = parseDevice(req);
    res.json({ success: true, data: await devPortalService.createPrompt(req.params.projectId, req.devUser.devMemberId, req.body, deviceInfo) });
  } catch (error) { logger.error('Create prompt error', error as Error); res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to save prompt' } }); }
});

router.get('/prompts/:id', devAuth, async (req: any, res) => {
  try {
    const prompt = await devPortalService.getPrompt(req.params.id);
    if (!prompt) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    // Must be own prompt or shared; and member of the project
    if (prompt.member_id !== req.devUser.devMemberId && !prompt.is_shared) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (prompt.project_id && !await requireProjectMembership(prompt.project_id, req.devUser.devMemberId, res, req.devUser.role)) return;
    res.json({ success: true, data: prompt });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get prompt' } }); }
});

router.put('/prompts/:id', devAuth, async (req: any, res) => {
  try {
    const prompt = await devPortalService.getPrompt(req.params.id);
    if (!prompt) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    const isOwner = prompt.member_id === req.devUser.devMemberId;
    const isAdmin = ['ceo', 'lead'].includes(req.devUser.role);
    if (!isOwner && !isAdmin) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the author or an admin can edit this prompt' } });
    res.json({ success: true, data: await devPortalService.updatePrompt(req.params.id, req.body) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update prompt' } }); }
});

router.delete('/prompts/:id', devAuth, async (req: any, res) => {
  try {
    const prompt = await devPortalService.getPrompt(req.params.id);
    if (!prompt) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    const isOwner = prompt.member_id === req.devUser.devMemberId;
    const isAdmin = ['ceo', 'lead'].includes(req.devUser.role);
    if (!isOwner && !isAdmin) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the author or an admin can delete this prompt' } });
    await devPortalService.deletePrompt(req.params.id); res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to delete prompt' } }); }
});

// ── A5: PII redaction ──
// Stateless preview — scan arbitrary text (e.g. the Prompt Builder draft) for secrets.
router.post('/redact/preview', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: devPortalService.previewRedaction(req.body?.text || '') }); }
  catch (error: any) { res.status(400).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Preview failed' } }); }
});

// Owner/admin gate shared by redact + share (author_id is the real column).
async function promptOwnerOr403(promptId: string, req: any, res: any) {
  const prompt = await devPortalService.getPrompt(promptId);
  if (!prompt) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } }); return null; }
  const ok = prompt.author_id === req.devUser.devMemberId || ['ceo', 'lead'].includes(req.devUser.role);
  if (!ok) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the author or an admin can change this prompt' } }); return null; }
  return prompt;
}

router.post('/prompts/:id/redact', devAuth, async (req: any, res) => {
  try {
    if (!await promptOwnerOr403(req.params.id, req, res)) return;
    res.json({ success: true, data: await devPortalService.redactPrompt(req.params.id) });
  } catch (error: any) { res.status(400).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Redact failed' } }); }
});

router.post('/prompts/:id/share', devAuth, async (req: any, res) => {
  try {
    if (!await promptOwnerOr403(req.params.id, req, res)) return;
    res.json({ success: true, data: await devPortalService.setPromptShared(req.params.id, !!req.body?.is_shared) });
  } catch (error: any) { res.status(400).json({ success: false, error: { code: 'PII_BLOCKED', message: error?.message || 'Share failed' } }); }
});

// Device info endpoint — returns only non-sensitive client device details
router.get('/device-info', devAuth, async (req: any, res) => {
  try {
    const device = parseDevice(req);
    const os_mod = require('os');
    // Return only client-side device context + server platform (no cwd, hostname, arch, node version, uptime)
    res.json({ success: true, data: {
      os: device.os,
      device_type: device.device_type,
      device_name: device.device_name,
      platform: os_mod.platform() === 'win32' ? 'windows' : os_mod.platform() === 'darwin' ? 'darwin' : 'linux',
      role: req.devUser?.role || 'Unknown',
    }});
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get device info' } }); }
});

// Log prompt from CLI/hook (simplified — auto-detects everything)
router.post('/prompts/from-cli', devAuth, async (req: any, res) => {
  try {
    const deviceInfo = parseDevice(req);
    // Auto-find project
    const { db } = require('@vibestudio/database');
    const project = await db('dev_projects').first();
    if (!project) return res.status(404).json({ success: false, error: { code: 'NO_PROJECT', message: 'No project found' } });
    const prompt = await devPortalService.createPrompt(project.id, req.devUser.devMemberId, req.body, deviceInfo);
    res.json({ success: true, data: prompt });
  } catch (error: any) {
    logger.error('CLI prompt error', error);
    res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to log prompt' } });
  }
});

// ── AI Providers ──
const { chatCompletion, getProviderKey, setProviderKey, getProviderStatus, AI_PROVIDERS } = require('../../../../domains/dev-portal/src/ai-provider-service');

router.get('/ai/providers', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await getProviderStatus() }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get providers' } }); }
});

router.put('/ai/providers/:provider/key', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try {
    if (!Object.keys(AI_PROVIDERS).includes(req.params.provider)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_PROVIDER', message: `Unknown provider: ${req.params.provider}` } });
    }
    await setProviderKey(req.params.provider, req.body.api_key, req.devUser.devMemberId);
    res.json({ success: true, data: { provider: req.params.provider, configured: true } });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to save key' } }); }
});

router.post('/ai/chat', devAuth, async (req: any, res) => {
  try {
    const { provider, model, messages, temperature, max_tokens, system_prompt, task_id, log_conversation } = req.body;

    // Whitelist provider
    if (!Object.keys(AI_PROVIDERS).includes(provider)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_PROVIDER', message: `Unknown provider: ${provider}` } });
    }

    // Local providers (Ollama) are keyless — skip the key requirement.
    const isLocal = AI_PROVIDERS[provider]?.authHeader === 'none';
    const apiKey = isLocal ? '' : await getProviderKey(provider);
    if (!apiKey && !isLocal) return res.status(400).json({ success: false, error: { code: 'NO_KEY', message: `No API key configured for ${AI_PROVIDERS[provider]?.name || provider}. Go to Platform Settings → AI Providers to add your key.` } });

    // Cap max_tokens server-side
    const safeMaxTokens = Math.min(Number(max_tokens) || 2048, 8192);

    const startTime = Date.now();
    const result = await chatCompletion(provider, apiKey, model, messages, { temperature, maxTokens: safeMaxTokens, systemPrompt: system_prompt });
    const duration = Math.round((Date.now() - startTime) / 1000);

    // Auto-save to prompt history (respect log_conversation flag, default true)
    const shouldLog = log_conversation !== false;
    if (shouldLog) {
      // Use the requester's active_project_id — fall back to null
      const activeProjectId = await devPortalService.getActiveProjectId(req.devUser.devMemberId).catch(() => null);
      if (activeProjectId) {
        const deviceInfo = parseDevice(req);
        await devPortalService.createPrompt(activeProjectId, req.devUser.devMemberId, {
          task_id: task_id || null,
          template: 'ai_chat',
          ai_origin: 'dev_portal_chat',
          provider,
          title: `${AI_PROVIDERS[provider]?.name || provider}: ${messages[messages.length - 1]?.content?.substring(0, 80) || 'Chat'}`,
          prompt: messages.map((m: any) => `[${m.role}] ${m.content}`).join('\n\n'),
          response_summary: result.content.substring(0, 500),
          model: result.model,
          status: 'completed',
          prompt_tokens: result.promptTokens,
          response_tokens: result.responseTokens,
          cache_read_tokens: result.cacheReadTokens || 0,
          cache_write_tokens: result.cacheWriteTokens || 0,
          duration_seconds: duration,
          labels: [provider, model],
        }, deviceInfo);
      }
    }

    res.json({ success: true, data: { ...result, duration } });
  } catch (error: any) {
    logger.error('AI chat error:', error);
    res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: error?.message || 'AI request failed' } });
  }
});

router.post('/ai/test-key', devAuth, async (req: any, res) => {
  try {
    const { provider, api_key } = req.body;
    const result = await chatCompletion(provider, api_key, AI_PROVIDERS[provider]?.models[0]?.id || 'gpt-4o-mini',
      [{ role: 'user', content: 'Say "connected" in one word.' }],
      { maxTokens: 10 }
    );
    res.json({ success: true, data: { working: true, response: result.content, model: result.model } });
  } catch (error: any) {
    res.json({ success: false, error: { code: 'TEST_FAILED', message: error?.message || 'Connection failed' } });
  }
});

// ── Local AI Memory Search (A2 / Local AI Layer #9) ──
const { memorySearchService } = require('../../../../domains/dev-portal/src/memory-search-service');

// Build/rebuild the local embedding index over the .claude/ + docs corpus.
router.post('/memory/index', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await memorySearchService.buildIndex({ projectSlug: req.body.project_slug }) }); }
  catch (error: any) { res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Index failed' } }); }
});

// Semantic (or lexical-fallback) search over the memory corpus.
router.post('/memory/search', devAuth, async (req: any, res) => {
  try {
    const { query, k, project_slug } = req.body;
    res.json({ success: true, data: await memorySearchService.search(query, { k, projectSlug: project_slug }) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Search failed' } });
  }
});

// ── Code File Browser (multi-project) ──

/** Allowlisted root directories for code file browsing. */
const CODE_FILE_ALLOWED_ROOTS = [
  process.cwd(),
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'projects'),
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'Documents'),
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'flutter projects'),
];

function isPathAllowed(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return CODE_FILE_ALLOWED_ROOTS.some(root => resolved === root || resolved.startsWith(root + path.sep));
}

router.get('/code-files', devAuth, async (req: any, res) => {
  try {
    const reqPath = req.query.path as string || '';
    const reqRoot = req.query.root as string || '';
    // Validate root if provided
    if (reqRoot && !isPathAllowed(reqRoot)) {
      return res.status(403).json({ success: false, error: { code: 'PATH_DENIED', message: 'Access to this path is not allowed' } });
    }
    res.json({ success: true, data: await devPortalService.browseCodeFiles(reqPath, reqRoot || undefined) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to browse files' } }); }
});

router.get('/code-files/content', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.readCodeFile(req.query.path as string, req.query.root as string || undefined) }); }
  catch (error: any) { res.status(error?.message === 'Access denied' ? 403 : 500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to read file' } }); }
});

router.get('/code-files/projects', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getLinkedProjects() }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get projects' } }); }
});

router.post('/code-files/projects', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.addLinkedProject(req.body.project_id, req.body.name, req.body.path) }); }
  catch (error: any) { res.status(400).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to add project' } }); }
});

router.delete('/code-files/projects', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.removeLinkedProject(req.body.project_id, req.body.path) }); }
  catch (error: any) { res.status(400).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to remove project' } }); }
});

// Browse server folders (for folder picker UI)
router.get('/code-files/browse-folders', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.browseFolders(req.query.path as string || undefined) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to browse folders' } }); }
});

// Clone git repo
const GITHUB_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/;
router.post('/code-files/clone', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try {
    const url: string = req.body.url || '';
    if (!GITHUB_URL_RE.test(url)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_URL', message: 'URL must be a valid https://github.com/<owner>/<repo> URL' } });
    }
    res.json({ success: true, data: await devPortalService.cloneGitRepo(req.body.project_id, url, req.body.name) });
  } catch (error: any) { res.status(400).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Clone failed' } }); }
});

// IDE Monitor (#5): read-only git snapshot of a local repo (branch, changes, commits).
router.get('/ops/monitor', devAuth, async (req: any, res) => {
  try {
    const p = (req.query.path as string) || '';
    if (p && !isPathAllowed(p)) {
      return res.status(403).json({ success: false, error: { code: 'PATH_DENIED', message: 'Access to this path is not allowed' } });
    }
    res.json({ success: true, data: await devPortalService.getRepoStatus(p || undefined) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Monitor failed' } });
  }
});

// Live IDE Monitor via SSE — pushes a fresh repo snapshot whenever the working
// tree / branch / commits change. devAuthNoTx so the stream holds no DB trx;
// EventSource (withCredentials) sends the dev_portal_token cookie.
router.get('/ops/monitor/stream', devAuthNoTx, (req: any, res: any) => {
  const p = (req.query.path as string) || '';
  if (p && !isPathAllowed(p)) {
    return res.status(403).json({ success: false, error: { code: 'PATH_DENIED', message: 'Access to this path is not allowed' } });
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  const send = (event: string, data: any) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client gone */ } };
  let stop = () => {};
  try {
    stop = devPortalService.watchRepo(p || undefined, (snap: any) => send('monitor', snap), { intervalMs: Number(req.query.interval) || 3000 });
  } catch (e: any) {
    send('error', { message: e?.message || 'watch failed' });
  }
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  const cleanup = () => { clearInterval(hb); try { stop(); } catch {} try { res.end(); } catch {} };
  req.on('close', cleanup);
  res.on('error', cleanup);
});

// A4: scan a repo's commits and link them to tasks by task key (e.g. VIBE-11).
router.post('/ops/scan-commits', devAuth, async (req: any, res) => {
  try {
    const { repo_path, limit } = req.body || {};
    if (repo_path && !isPathAllowed(repo_path)) {
      return res.status(403).json({ success: false, error: { code: 'PATH_DENIED', message: 'Access to this path is not allowed' } });
    }
    const data = await devPortalService.scanRepoTaskLinks({ repoPath: repo_path, limit, createdBy: req.devUser.devMemberId });
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Scan commits error', error as Error);
    res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Scan failed' } });
  }
});

// Cost Tracker: budget caps + per-model prices (.claude/cost-tracking/budget.json).
router.get('/ops/budget', devAuth, async (_req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getBudget() }); }
  catch (error: any) { res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to load budget' } }); }
});

// Cost Tracker: monthly cost rollups (platform-wide spend per model/provider/member/project).
// GET computes a month (default current) + lists months with usage. POST persists
// the rollup to .claude/cost-tracking/<month>.md (managers only).
router.get('/ops/cost-rollup', devAuth, async (req: any, res) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const [rollup, months] = await Promise.all([
      devPortalService.getMonthlyRollup(month),
      devPortalService.listRollupMonths(),
    ]);
    res.json({ success: true, data: { rollup, months } });
  } catch (error: any) { logger.error('Cost rollup error', error as Error); res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to compute rollup' } }); }
});

router.post('/ops/cost-rollup', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try {
    res.json({ success: true, data: await devPortalService.writeMonthlyRollup(req.body?.month) });
  } catch (error: any) { logger.error('Cost rollup write error', error as Error); res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to write rollup' } }); }
});

// Auto bug-capture (A4/A6): write a bug-history entry + return a fix prompt.
router.post('/ops/bug-capture', devAuth, async (req: any, res) => {
  try {
    const { repo_path, title, error, file, line, tool } = req.body;
    if (repo_path && !isPathAllowed(repo_path)) {
      return res.status(403).json({ success: false, error: { code: 'PATH_DENIED', message: 'Access to this path is not allowed' } });
    }
    const data = await devPortalService.captureBug({ repoPath: repo_path, title, error, file, line, tool, actorId: req.devUser.devMemberId });
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Capture failed' } });
  }
});

// ── Code Notes ──
router.get('/projects/:projectId/code-notes', devAuth, async (req: any, res) => {
  try {
    res.json({ success: true, data: await devPortalService.listCodeNotes(req.params.projectId, req.devUser.devMemberId, {
      file_path: req.query.file_path as string,
      note_type: req.query.note_type as string,
      search: req.query.search as string,
    }) });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list notes' } }); }
});

router.post('/projects/:projectId/code-notes', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.createCodeNote(req.params.projectId, req.devUser.devMemberId, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to create note' } }); }
});

router.get('/projects/:projectId/code-notes/stats', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.getCodeNoteStats(req.params.projectId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get note stats' } }); }
});

router.put('/code-notes/:id', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.updateCodeNote(req.params.id, req.devUser.devMemberId, req.body) }); }
  catch (error: any) { res.status(error?.message === 'Not authorized' ? 403 : 500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to update note' } }); }
});

router.delete('/code-notes/:id', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.deleteCodeNote(req.params.id, req.devUser.devMemberId) }); }
  catch (error: any) { res.status(error?.message === 'Not authorized' ? 403 : 500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to delete note' } }); }
});

// ── Mobile Deployment ──
const { mobileDeployService } = require('../../../../domains/dev-portal/src/mobile-deploy-service');

router.get('/mobile/credentials', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.listCredentials() }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list credentials' } }); }
});

router.post('/mobile/credentials', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.createCredential(req.devUser.devMemberId, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to create credential' } }); }
});

router.put('/mobile/credentials/:id', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.updateCredential(req.params.id, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update credential' } }); }
});

router.delete('/mobile/credentials/:id', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.deleteCredential(req.params.id) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to delete credential' } }); }
});

router.post('/mobile/build', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.triggerBuild(req.devUser.devMemberId, req.body) }); }
  catch (error: any) { res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to trigger build' } }); }
});

router.get('/mobile/builds', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.listBuilds({ platform: req.query.platform as string, status: req.query.status as string, limit: Number(req.query.limit) || 50 }) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list builds' } }); }
});

router.get('/mobile/builds/:id', devAuth, async (req: any, res) => {
  try { const b = await mobileDeployService.getBuild(req.params.id); b ? res.json({ success: true, data: b }) : res.status(404).json({ success: false }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get build' } }); }
});

router.post('/mobile/builds/:id/cancel', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.cancelBuild(req.params.id) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to cancel build' } }); }
});

router.post('/mobile/builds/:id/submit', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.submitToStore(req.params.id, req.devUser.devMemberId) }); }
  catch (error: any) { res.status(500).json({ success: false, error: { code: 'ERROR', message: error?.message || 'Failed to submit' } }); }
});

router.post('/mobile/ota-update', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.publishOtaUpdate(req.devUser.devMemberId, req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to publish OTA update' } }); }
});

router.get('/mobile/ota-updates', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.listOtaUpdates() }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list OTA updates' } }); }
});

router.post('/mobile/ota-updates/:id/rollback', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.rollbackOta(req.params.id) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to rollback' } }); }
});

router.get('/mobile/config', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.getAppConfig() }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to get config' } }); }
});

router.put('/mobile/config/version', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { res.json({ success: true, data: await mobileDeployService.updateAppVersion(req.body.version, req.body.buildNumber) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to update version' } }); }
});

// ── Ops Proxy (dev-portal authenticated, service-account backed) ──
// All ops routes here use devAuth + requireRole('ceo','lead') for write ops.
// They proxy to the same service layer as /api/v1/ops/* but without
// requiring a separate admin-user login from the browser.


// GET /api/v1/dev-portal/ops/health
router.get('/ops/health', devAuth, async (req: any, res) => {
  try {
    const { db } = require('@vibestudio/database');
    const dbCheck = await db.raw('SELECT NOW() as time, current_database() as db').then((r: any) => r.rows?.[0]);
    const memberCount = await db('dev_team_members').count('id as c').first();
    const projectCount = await db('dev_projects').count('id as c').first();
    const tableCount = await db.raw("SELECT count(*) as c FROM information_schema.tables WHERE table_schema = 'public'").then((r: any) => r.rows?.[0]?.c);
    const migrationCount = await db('knex_migrations').count('id as c').first();
    const activeMembers = await db('dev_team_members').where({ status: 'active' }).count('id as c').first();
    res.json({ success: true, data: {
      server: { time: dbCheck?.time, database: dbCheck?.db, nodeVersion: process.version, uptime: Math.floor(process.uptime()) + 's', env: process.env.NODE_ENV || 'development' },
      counts: { members: Number(memberCount?.c || 0), projects: Number(projectCount?.c || 0), tables: Number(tableCount || 0), migrations: Number(migrationCount?.c || 0), activeMembers: Number(activeMembers?.c || 0) },
      memory: { rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB', heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB' },
    }});
  } catch (e: any) { res.status(500).json({ success: false, error: { message: e.message } }); }
});

// GET /api/v1/dev-portal/ops/git
router.get('/ops/git', devAuth, async (req: any, res) => {
  try {
    const { execSync: ex } = require('child_process');
    const cwd = process.cwd();
    const branch = ex('git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown', { cwd, encoding: 'utf8' }).trim();
    const log = ex('git log --oneline -10 2>/dev/null || echo ""', { cwd, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    const status = ex('git status --short 2>/dev/null || echo ""', { cwd, encoding: 'utf8' }).trim();
    const branches = ex('git branch -a 2>/dev/null || echo ""', { cwd, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    res.json({ success: true, data: { branch, log, status, branches } });
  } catch (e: any) { res.status(500).json({ success: false, error: { message: e.message } }); }
});

// GET /api/v1/dev-portal/ops/pm2
router.get('/ops/pm2', devAuth, async (req: any, res) => {
  try {
    const { execSync: ex } = require('child_process');
    const raw = ex('pm2 jlist 2>/dev/null || echo "[]"', { encoding: 'utf8' });
    const procs = JSON.parse(raw.trim() || '[]');
    const list = procs.map((p: any) => ({
      id: p.pm_id, name: p.name,
      status: p.pm2_env?.status || 'unknown',
      memory: Math.round((p.monit?.memory || 0) / 1024 / 1024) + ' MB',
      cpu: (p.monit?.cpu || 0) + '%',
      uptime: p.pm2_env?.pm_uptime,
    }));
    res.json({ success: true, data: list });
  } catch (e: any) { res.status(500).json({ success: false, error: { message: e.message } }); }
});

// GET /api/v1/dev-portal/ops/migrations
router.get('/ops/migrations', devAuth, async (req: any, res) => {
  try {
    const { db } = require('@vibestudio/database');
    const path_m = require('path');
    const completed = await db('knex_migrations').select('name', 'migration_time').orderBy('id', 'desc').limit(10);
    const pending = await db.migrate.list({ directory: path_m.resolve(process.cwd(), 'infrastructure/migrations') }).catch(() => [[], []]);
    res.json({ success: true, data: { completed, pending: pending[1] || [] } });
  } catch (e: any) { res.status(500).json({ success: false, error: { message: e.message } }); }
});

// GET /api/v1/dev-portal/ops/db-stats
router.get('/ops/db-stats', devAuth, async (req: any, res) => {
  try {
    const { db } = require('@vibestudio/database');
    const members = await db('dev_team_members').select('email', 'status', 'role', 'is_ai_agent', 'agent_type').orderBy('created_at', 'desc');
    const projects = await db('dev_projects').select('id', 'name', 'key', 'priority', 'status').orderBy('created_at', 'desc');
    res.json({ success: true, data: { members, projects } });
  } catch (e: any) { res.status(500).json({ success: false, error: { message: e.message } }); }
});

// GET /api/v1/dev-portal/ops/audit-log
router.get('/ops/audit-log', devAuth, async (req: any, res) => {
  try {
    const fs_a = require('fs');
    const path_a = require('path');
    const AUDIT_FILE_PATH = path_a.resolve(process.cwd(), 'infrastructure/deploy/audit.log');
    let content = '';
    try { content = fs_a.readFileSync(AUDIT_FILE_PATH, 'utf-8'); } catch { content = ''; }
    const lines = content.trim().split('\n').filter((l: string) => l).reverse().slice(0, 100);
    res.json({ success: true, data: {
      entries: lines.map((l: string) => {
        const [time, admin, action, result, detail] = l.split(' | ');
        return { time, admin, action, result, detail };
      }),
    }});
  } catch (e: any) { res.status(500).json({ success: false, error: { message: e.message } }); }
});

// GET /api/v1/dev-portal/ops/environment-info
// Returns non-secret server/repo info for display only (no DB passwords)
router.get('/ops/environment-info', devAuth, async (req: any, res) => {
  try {
    const os_e = require('os');
    res.json({ success: true, data: {
      serverHostname: os_e.hostname(),
      serverIp: process.env.SERVER_IP || '(configured server)',
      repoUrl: process.env.REPO_URL || '(configured repo)',
      domain: process.env.SERVER_DOMAIN || 'codes-ai.uk',
      nodeVersion: process.version,
      platform: os_e.platform(),
    }});
  } catch (e: any) { res.status(500).json({ success: false, error: { message: e.message } }); }
});

// Helper: forward a request to the internal ops service using a short-lived service token
async function proxyToOps(method: 'get' | 'post', opsPath: string, body: any, res: any) {
  const axios_p = require('axios');
  const { config } = require('@vibestudio/config');
  const jwt_p = require('jsonwebtoken');
  const jwtSecret = config.jwtSecret || process.env.JWT_SECRET;
  const svcToken = jwt_p.sign({ email: 'dev-portal-service@internal', role: 'admin', _svc: true }, jwtSecret, { expiresIn: '30s' });
  const base = `http://localhost:${process.env.PORT || 4000}/api/v1`;
  const r = method === 'get'
    ? await axios_p.get(`${base}/ops${opsPath}`, { headers: { Authorization: `Bearer ${svcToken}` }, timeout: 120000 })
    : await axios_p.post(`${base}/ops${opsPath}`, body || {}, { headers: { Authorization: `Bearer ${svcToken}` }, timeout: 120000 });
  res.json(r.data);
}

// POST /api/v1/dev-portal/ops/git-pull
router.post('/ops/git-pull', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/git-pull', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// POST /api/v1/dev-portal/ops/remote-cmd  (write op — CEO/lead only)
router.post('/ops/remote-cmd', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/remote-cmd', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// POST /api/v1/dev-portal/ops/remote-deploy  (write op — CEO/lead only)
router.post('/ops/remote-deploy', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/remote-deploy', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// GET /api/v1/dev-portal/ops/git-branches
router.get('/ops/git-branches', devAuth, async (req: any, res) => {
  try { await proxyToOps('get', '/git-branches', null, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// POST /api/v1/dev-portal/ops/git-fetch
router.post('/ops/git-fetch', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/git-fetch', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// POST /api/v1/dev-portal/ops/git-create-branch
router.post('/ops/git-create-branch', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/git-create-branch', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// POST /api/v1/dev-portal/ops/git-checkout-test
router.post('/ops/git-checkout-test', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/git-checkout-test', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// POST /api/v1/dev-portal/ops/git-deploy-test
router.post('/ops/git-deploy-test', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/git-deploy-test', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// POST /api/v1/dev-portal/ops/git-merge
router.post('/ops/git-merge', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/git-merge', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// POST /api/v1/dev-portal/ops/git-delete-branch
router.post('/ops/git-delete-branch', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/git-delete-branch', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// POST /api/v1/dev-portal/ops/migrate
router.post('/ops/migrate', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/migrate', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// POST /api/v1/dev-portal/ops/pm2-restart
router.post('/ops/pm2-restart', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/pm2-restart', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// POST /api/v1/dev-portal/ops/seed
router.post('/ops/seed', devAuth, requireRole('ceo', 'lead'), async (req: any, res) => {
  try { await proxyToOps('post', '/seed', req.body, res); }
  catch (e: any) { res.status(500).json({ success: false, error: { message: e.response?.data?.error?.message || e.message } }); }
});

// ── Search ──
router.get('/search', devAuth, async (req: any, res) => {
  try { res.json({ success: true, data: await devPortalService.search(req.query.q as string || '', req.devUser.devMemberId) }); }
  catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to search' } }); }
});

// ── Tasks by List ──
router.get('/lists/:listId/tasks', devAuth, async (req: any, res) => {
  try {
    const { db } = require('@vibestudio/database');
    const tasks = await db('dev_tasks')
      .leftJoin('dev_team_members as assignee', 'dev_tasks.assignee_id', 'assignee.id')
      .where('dev_tasks.list_id', req.params.listId)
      .select('dev_tasks.*', 'assignee.name as assignee_name', 'assignee.display_name as assignee_display_name', 'assignee.is_ai_agent as assignee_is_ai')
      .orderBy('dev_tasks.position').orderBy('dev_tasks.created_at', 'desc');
    res.json({ success: true, data: tasks });
  } catch (error) { res.status(500).json({ success: false, error: { code: 'ERROR', message: 'Failed to list tasks' } }); }
});

export default router;
