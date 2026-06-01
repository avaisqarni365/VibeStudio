# API_CONTRACT.md — VibeStudio

- **Base:** `/api/v1/dev-portal` (Express, `:4100`). ~133 endpoints in
  `apps/api/src/routes/dev-portal.ts`.
- **Auth:** `dev_portal_token` (httpOnly cookie) or `Authorization: Bearer
  <token>`. Middleware `devAuth`; writes gated by `requireRole(...)`.
- **Response envelope:** `{ "success": true, "data": ... }` or
  `{ "success": false, "error": { "code", "message", "requestId" } }`.
- **Health:** `GET /health` (unauthenticated) → `{ ok, service, version, uptime_s }`.
- **Tracing:** `X-Request-Id` echoed/generated per request.

## Endpoint groups

| Group | Examples | Notes |
|---|---|---|
| Auth | `POST /auth/login`, `/auth/logout`, `/auth/refresh`, `GET /auth/me` | sets/clears `dev_portal_token` |
| Team | `GET /team`, `/team/:id`, `/team/:id/workload`, `/team/:id/activity`, `POST /team` | `requireRole('ceo','lead')` for writes |
| Projects | `GET /projects`, `/portfolio`, `GET/PUT /active-project`, `/projects/:projectId/{dashboard,tasks,sprints,members,wiki,activity,prompts,prompt-stats,cost-roi,active-sprint,code-notes}` | **viewer-scoped multi-project**: `GET /projects` + `/portfolio` return only the caller's linked projects, **except `ceo`** (super-admin) who sees all + can enter any workspace (RLS bypass, migration 087). `GET /active-project` resolves to a visible project (login landing); `PUT /active-project` 403s on an invisible one. `cost-roi` (A7) = AI spend per task/sprint, costed with `budget.json` |
| Sprints | `GET /sprints/:id/{stats,tasks}`, `POST /projects/:projectId/sprints`, `PUT /sprints/:id` | |
| Tasks | `GET /tasks/:id`, `GET /lists/:listId/tasks`, create/update/move, `GET/POST /tasks/:id/links`, `DELETE /task-links/:id` | board + list; `links` (A4) = commit/PR/CI refs for the task |
| Spaces/Docs | `GET /spaces`, `/spaces/:id/{lists,docs}`, `/docs/:id` | ClickUp-style workspace |
| Channels/Inbox | `GET /channels`, `/channels/:id/messages`, `POST …`, `GET /inbox`, `/inbox/count` | threaded chat + notifications |
| Bookmarks/Favorites | `GET/POST/DELETE /bookmarks`, `/favorites` | per-member |
| Prompts | `GET /prompts/:id`, `/projects/:projectId/prompts`, `DELETE /prompts/:id`, `POST /prompts/:id/{redact,share}`, `POST /redact/preview` | prompt library / history; A5 = redact PII + share-gate (`share` blocks until `is_pii_redacted`); `redact/preview` is stateless |
| Experiments (A3) | `GET/POST /projects/:projectId/experiments`, `GET/DELETE /experiments/:id`, `POST /experiments/:id/decide`, `POST /experiments/:id/variants/:variantId/run`, `POST /variants/:variantId/rate` | prompt A/B testing; `run` is live (provider) or `{manual:{response,prompt_tokens,...}}`; costs via `budget.json` + logs to `dev_prompt_history` |
| AI | `POST /ai/chat`, `POST /ai/test-key`, `GET /ai/providers` | multi-provider (Claude default, Ollama local); 503 if no key |
| Memory (A2) | `POST /memory/index` (ceo/lead), `POST /memory/search` | local RAG over `.claude/` + docs; Ollama embeddings, lexical fallback |
| Mobile | `GET /mobile/{builds,builds/:id,ota-updates,credentials,config}`, `DELETE /mobile/credentials/:id` | EAS build/OTA + encrypted creds |
| Code files (IDE) | `GET /code-files`, `/code-files/{content,browse-folders,projects}`, `POST /code-files/{clone,projects}` | folder browse/clone — IDE Monitor base |
| Usage | `GET /me/usage`, `/me/usage/:id` | token/cost per member |
| Ops | `GET /ops/{health,db-stats,migrations,git,git-branches,pm2,environment-info,audit-log,monitor,monitor/stream,budget,cost-rollup}`, `POST /ops/{remote-cmd,bug-capture,cost-rollup,scan-commits}` | `monitor` = read-only git snapshot; `monitor/stream` = **SSE live watcher** (pushes a fresh snapshot on working-tree/commit change; `devAuthNoTx` so no DB trx is held — EventSource sends the cookie); `budget` = caps + per-model prices; `GET cost-rollup` = monthly spend per model/provider/member/project; `POST cost-rollup` writes `.claude/cost-tracking/<month>.md` (`requireRole('ceo','lead')`); `scan-commits` (A4) = parse a repo's commits for task keys → link to tasks (path-allowlisted); `remote-cmd` = `requireRole('ceo','lead')` |
| Search | `GET /search` | cross-entity |

## Conventions for new endpoints
- Mount under `/api/v1/dev-portal`; guard with `devAuth` + `requireRole` as needed.
- Validate input with Zod; return the standard envelope.
- Project-scoped data → `/projects/:projectId/<resource>`.
- Call `logActivity(...)` on mutations; never query non-`dev_*` tables.
- Frontend consumes via `useDevAuth().devApi`.
