---
name: vibestudio-database
description: "Use when working with VibeStudio's Postgres schema — 29 tables all prefixed dev_*, inherited from ACCA migrations 047-080. Knex.js migrations + seeds. RLS toggled off in 078 + re-enabled in 079. Bcrypt password hashes in dev_team_members. AES-256-GCM encryption in dev_mobile_credentials. Single seed: 005_dev_portal_data.js."
---

# VibeStudio — Database

## 29 tables, all prefixed `dev_*`

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

**Final state:** RLS enabled. Direct DB scripts MUST set
`app.current_member_id` per transaction:

```js
await trx.raw(`SET LOCAL app.current_member_id = '${memberId}'`);
```

(NOT `app.current_org_id` — that was ACCA's tenant column. VibeStudio
isn't multi-tenant.)

## Seed

`infrastructure/seeds/005_dev_portal_data.js` — single file:
- CEO user (`ceo@codes-ai.uk` — change before production!)
- 5 human team members (Sarah, Alex, Maria, Tom, Lisa) with skills
- 6 AI agents (coding, QA, security, ops, analytics, release)
- Sample projects + spaces + channels + sprints + tasks

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
- Next migration number: **082**
- Use `hasTable` / `hasColumn` guards for idempotency
- Both `up` and `down` mandatory

## Related skills

- [[vibestudio-session-bootstrap]]
- [[vibestudio-ionos-deploy]]
- [[vibestudio-architecture]]
- [[vibestudio-auth]]
