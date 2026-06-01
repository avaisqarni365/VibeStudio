# DATABASE_DESIGN.md — VibeStudio

Postgres. **29 tables, all prefixed `dev_*`.** UUID PKs (`gen_random_uuid`),
snake_case columns, `created_at`/`updated_at`, JSONB for flexible data. RLS
enabled — direct scripts `SET LOCAL app.current_member_id`. Full detail in
`.claude/skills/vibe-engineering-studio/references/13-vibestudio-database.md`.

## Entities by area

### Core (migration 047)
`dev_team_members` (humans + AI agents: `password_hash`, `refresh_token_hash`,
`is_ai_agent`, `agent_type`) · `dev_projects` (key, color, icon, lead_id,
`settings` JSONB, repository_url, tech_stack) · `dev_project_members` (N:N,
role, allocation_percent) · `dev_sprints` (status, capacity/completed points,
`retrospective` JSONB) · `dev_tasks` (parent_id, type, status, priority,
story_points, assignee/reporter, labels, git_branch, estimate/spent,
is_ai_generated, position) · `dev_task_comments` · `dev_task_dependencies` ·
`dev_activity_log` (actor, action, entity_type, entity_id).

### Workspace (migration 048)
`dev_spaces` · `dev_lists` · `dev_docs` (markdown, parent_id, pinning) ·
`dev_favorites` · `dev_views`.

### Collaboration (migration 048)
`dev_channels` · `dev_channel_members` (role, last_read_at) · `dev_messages`
(reply_to_id, is_edited) · `dev_inbox` (type, target_*, actor_id, is_read) ·
`dev_bookmarks`.

### AI usage (049, 052)
`dev_prompt_history` (template, prompt, response_summary, model, tokens,
duration, device, ip, hostname, rating, is_shared, expires_at,
is_pii_redacted, actor_email, ai_origin, provider) · `dev_code_notes`
(file path + line range annotations).

### Mobile CI/CD (053)
`dev_mobile_credentials` (AES-256-GCM: encrypted_value + iv + auth_tag) ·
`dev_mobile_builds` (platform, profile, status, artifact_url) ·
`dev_mobile_ota_updates` (channel, runtime_version, status).

### Security (074)
`dev_sessions` (token_hash, ip, user_agent, is_active, expires_at,
revoked_at, revoked_reason).

## Key relationships
- `dev_projects 1—N dev_sprints / dev_tasks / dev_docs / dev_channels`
- `dev_sprints 1—N dev_tasks` (sprint_id); `dev_tasks` self-ref (`parent_id`) + `dev_task_dependencies`
- `dev_team_members N—N dev_projects` via `dev_project_members`
- All mutations append to `dev_activity_log`.

## Indexes / audit
Index `project_id`, `assignee_id`, `sprint_id`, `status` on `dev_tasks`;
`member_id` on inbox/favorites/bookmarks. Every table carries audit timestamps.

## Migrations
047,048,049,052,053,054,070,074,078 (drop RLS),079 (re-enable RLS),080,
**081** (rebrand host identity). **Next: 082.** Never edit a shipped migration;
add `NNN_dev_<slug>.js` with `up`/`down` + `hasTable`/`hasColumn` guards.

## Multi-project & privacy
Single-tenant per studio; projects isolated by `project_id` + RLS. No PII
beyond team member emails. Mobile credentials encrypted at rest;
`is_pii_redacted` must be set before sharing a prompt externally.
