---
name: vibestudio-database
description: "Use when working with VibeStudio's Postgres schema — 29 tables all prefixed dev_*, inherited from ACCA migrations 047-080. Knex.js migrations + seeds. RLS toggled off in 078 + re-enabled in 079. Bcrypt password hashes in dev_team_members. AES-256-GCM encryption in dev_mobile_credentials. Single seed: 005_dev_portal_data.js."
---

# VibeStudio — Database

## 32 tables, all prefixed `dev_*`

### Core (8) — created in migration 047
- `dev_team_members` — users (humans + AI agents); has `password_hash`, `refresh_token_hash`, `is_ai_agent`, `agent_type`
- `dev_projects` — top-level projects; key, color, icon, lead_id, settings, priority, repository_url, tech_stack
- `dev_project_members` — N-to-N project ↔ member with role, allocation_percent (migration 054)
- `dev_sprints` — per-project sprints with status, capacity_points, completed_points, retrospective JSONB
- `dev_tasks` — full task model with parent_id, type, status, priority, story_points, assignee_id, reporter_id, labels, git_branch, time_estimate/spent, is_ai_generated, position
- `dev_task_comments` — author, content, type, metadata
- `dev_task_dependencies` — task_id ↔ depends_on_id
- `dev_activity_log` — actor + action + entity_type + entity_id

### Workspace / ClickUp-style (5) — migration 048
- `dev_spaces` — top-level containers (name, icon, color, visibility)
- `dev_lists` — within a space
- `dev_docs` — within a space; supports parent_id for hierarchy, content (markdown), pinning
- `dev_favorites` — per-member, points at any entity
- `dev_views` — saved board/list views

### Collaboration (5) — migration 048
- `dev_channels` — chat channels; type, is_default
- `dev_channel_members` — N-to-N with role + last_read_at
- `dev_messages` — author, content, type, reply_to_id, is_edited
- `dev_inbox` — notifications per member (type, target_*, actor_id, is_read)
- `dev_bookmarks` — per-member URL/entity bookmarks

### AI usage (2) — migrations 049 + 052
- `dev_prompt_history` — platform-wide AI call log (template, prompt, response_summary, model, tokens, duration, device, ip, hostname, rating, notes, is_shared, expires_at, is_pii_redacted)
- `dev_code_notes` — code annotations linked to file path + line range

### Mobile CI/CD (3) — migration 053
- `dev_mobile_credentials` — encrypted credentials (AES-256-GCM with iv + auth_tag)
- `dev_mobile_builds` — EAS Build records (platform, profile, status, artifact_url)
- `dev_mobile_ota_updates` — EAS Update records (channel, runtime_version, status)

### Security (1) — migration 074
- `dev_sessions` — active session tracking for revocation (token_hash, ip, user_agent, is_active, expires_at, revoked_at, revoked_reason)

### VCS/CI bridge (1) — migration 085
- `dev_task_links` — A4: links a task to commit/PR/CI refs (`link_type` commit|pr|ci, `ref`, `title`, `url`, `status`, `branch`, `repo`, `author`, `external_at`). Unique (task_id, link_type, ref). NOT force-RLS (route-gated like `dev_prompt_history`)

### Prompt A/B (2) — migration 086
- `dev_prompt_experiments` — A3 experiment header (name, hypothesis, status open|decided, winner_variant_id, project_id, task_id)
- `dev_prompt_variants` — per-variant prompt + run aggregates (runs, total_*_tokens, total_cost, total_duration_ms, rating_sum/count, last_response). Both route-gated via the experiment's project

## Migrations

| # | File | What |
|---|---|---|
| 047 | `047_dev_portal.js` | Core 8 tables |
| 048 | `048_dev_portal_workspace.js` | Workspace + collab 10 tables |
| 049 | `049_dev_prompt_history.js` | AI usage log |
| 052 | `052_dev_code_notes.js` | Code annotations |
| 053 | `053_dev_mobile_deployment.js` | Mobile CI/CD |
| 054 | `054_dev_project_members.js` | N-to-N + project enhancements |
| 070 | `070_dev_portal_hardening.js` | RLS + refresh_token_hash + is_shared/expires_at/is_pii_redacted |
| 074 | `074_dev_sessions.js` | Session table |
| 078 | `078_drop_dev_portal_rls.js` | Disable RLS (debugging) |
| 079 | `079_reenable_dev_portal_rls.js` | Re-enable with proper context |
| 080 | `080_dev_tasks_fractional_hours.js` | Allow decimal hours |
| 081 | `081_rebrand_ceo_email.js` | Forward-correct host-app identity (CEO + agent emails, baseline wiki pages) post-extraction |
| 082 | `082_rebrand_default_project.js` | Rebrand the seeded default project "ACCA Platform" → "VibeStudio" (VIBE) |
| 083 | `083_dev_prompt_cache_tokens.js` | `cache_read_tokens` + `cache_write_tokens` on `dev_prompt_history` (Cost Tracker) |
| 084 | `084_dev_prompt_actor_columns.js` | `provider`/`ai_origin`/`actor_email`/`actor_role` on `dev_prompt_history` (were missing — ACCA migration 130 never extracted; `/me/usage` needs them) |
| 085 | `085_dev_task_links.js` | A4 commit/PR/CI ↔ task bridge — `dev_task_links` table |
| 086 | `086_dev_prompt_experiments.js` | A3 prompt A/B — `dev_prompt_experiments` + `dev_prompt_variants` |
| 087 | `087_dev_portal_rls_ceo_bypass.js` | CEO super-admin RLS bypass on `dev_tasks`/`dev_sprints`/`dev_wiki_pages` |

**Final state:** RLS enabled. The GUC the policies read is
**`app.current_dev_member_id`** (migrations 070/078/079) — NOT
`app.current_member_id`. Direct DB scripts / per-request middleware MUST set it:

```js
await trx.raw(`SELECT set_config('app.current_dev_member_id', ?, true)`, [memberId]);
```

The API sets this automatically in `apps/api/src/middleware/data-isolation.ts`
(`withRlsTransaction`, mounted by `devAuth`). It also sets a second GUC
**`app.current_dev_member_role`** (the requester's role) — read by the CEO
super-admin bypass (see below). The `db` proxy in `@vibestudio/database` routes
queries through the request trx via `dbStore` (AsyncLocalStorage). **Note:**
`npm run db:seed` does NOT set these — seed under RLS needs the GUC set or run as
a superuser (RLS bypass).

(NOT `app.current_org_id` — that was ACCA's tenant column. VibeStudio
isn't multi-tenant.)

**FORCE RLS + project membership (gotcha):** `dev_tasks` and `dev_sprints` use
**FORCE** row security with a member-scope policy keyed on `dev_project_members`
— so even the table owner is filtered, and a member with **no row** in
`dev_project_members` sees **zero** tasks/sprints (board, Cost ROI, etc. all
empty). The seed must enroll members (`005` now does). When adding a
project-scoped read, remember the gate is the `dev_project_members` row, not
just `devAuth`. `dev_prompt_history` is *not* force-RLS, so prompt aggregates
can appear even when the task join behind them returns nothing.

**CEO super-admin bypass (migration 087):** the `member_scope` policies on
`dev_tasks`/`dev_sprints`/`dev_wiki_pages` are `(app.current_dev_member_role =
'ceo') OR <membership>` for both USING and WITH CHECK — so the `ceo` role sees
and writes **every** project (enters any workspace) without a `dev_project_members`
row. Everyone else is still membership-scoped. The route-level twin is
`requireProjectMembership(projectId, memberId, res, role)` which short-circuits
for `ceo`. Per-member tables (prompt history, bookmarks, favorites, code notes,
channel members) are **not** bypassed — they stay strictly per-member even for the CEO.
Project list scoping lives in the service (`listProjects`/`getPortfolioStats`
take `(viewerId, role)`): non-CEO sees only linked projects; CEO sees all.

## Seed

`infrastructure/seeds/005_dev_portal_data.js` — single file:
- CEO user (`ceo@codes-ai.uk` — change before production!)
- 5 human team members (Sarah, Alex, Maria, Tom, Lisa) with skills
- 6 AI agents (coding, QA, security, ops, analytics, release)
- Sample projects + spaces + channels + sprints + tasks
- **Project memberships** — all 12 members enrolled in `dev_project_members`
  (REQUIRED for FORCE-RLS on `dev_tasks`/`dev_sprints`; idempotent)

**Default password** logged at the end of seed run. CHANGE on first
login.

## Encryption keys

- `JWT_SECRET` — JWTs for dev_portal_token
- `JWT_REFRESH_SECRET` — refresh tokens
- `MOBILE_DEPLOY_KEY` — AES-256-GCM key for `dev_mobile_credentials.encrypted_value`
  - Falls back to JWT_SECRET if unset

All three are 32-byte hex (`openssl rand -hex 32`).

## Bcrypt rounds

`dev_team_members.password_hash` uses bcryptjs default 10 rounds.
Modernisation candidate: argon2id with cost 19+, 4 lanes.

## Query patterns to know

```sql
-- All tasks assigned to a member in active sprints
SELECT t.* FROM dev_tasks t
JOIN dev_sprints s ON s.id = t.sprint_id
WHERE t.assignee_id = $1 AND s.status = 'active';

-- Sprint burndown
SELECT date_trunc('day', t.completed_at) AS day, SUM(t.story_points) AS points
FROM dev_tasks t
WHERE t.sprint_id = $1 AND t.status = 'done'
GROUP BY day ORDER BY day;

-- AI usage per author per month
SELECT date_trunc('month', created_at) AS m, author_id,
       COUNT(*), SUM(prompt_tokens + response_tokens) AS tokens
FROM dev_prompt_history
WHERE created_at >= NOW() - INTERVAL '12 months'
GROUP BY m, author_id;
```

## Migration discipline

- Never edit a shipped migration — write a new one
- Migration files are numbered `NNN_<slug>.js`
- Next migration number: **088**

## Local development DB (one command)

`npm run db:seed:local` (`scripts/seed-local.mjs`) = migrate → disable RLS →
seed → re-enable RLS. The app role owns the tables so it can toggle RLS itself;
no superuser needed for seeding. One-time superuser step (create role + DB) is in
`ACTION_PLAN.md`. Note: the task seed is not idempotent — re-running appends tasks.
- Use `hasTable` / `hasColumn` guards for idempotency
- Both `up` and `down` mandatory

## Related skills

- [[vibestudio-session-bootstrap]]
- [[vibestudio-ionos-deploy]]
- [[vibestudio-architecture]]
- [[vibestudio-auth]]
