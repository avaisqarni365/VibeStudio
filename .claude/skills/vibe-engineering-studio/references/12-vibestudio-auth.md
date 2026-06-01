---
name: vibestudio-auth
description: "Use when editing VibeStudio auth: apps/api/src/routes/dev-portal.ts (devAuth/requireRole/setDevAuthCookie/extractDevToken) or apps/web/src/hooks/useDevAuth.ts. Single auth stack: dev_portal_token JWT in an httpOnly cookie, with a Bearer-header fallback for cross-port localhost. Roles: ceo / lead / product_owner + AI agent roles (agent_*). There is NO acca_token, NO resolveOrgId, NO multi-tenant org model here."
---

# VibeStudio — Auth

VibeStudio has ONE auth stack. The ACCA two-surface split
(`acca_token` vs `dev_portal_token`) does not apply — only the
`dev_portal_token` side was extracted.

## The mechanics (apps/api/src/routes/dev-portal.ts)

- Cookie: `DEV_AUTH_COOKIE = 'dev_portal_token'` — httpOnly, `SameSite=Lax`, `Secure` in production (set by `setDevAuthCookie`, based on `NODE_ENV`).
- `extractDevToken(req)` reads the cookie first, then an `Authorization: Bearer <token>` header (the cross-port localhost fallback — some browsers drop cookies between :3100 and :4100).
- `devAuth` middleware guards every protected route. `requireRole(...roles)` gates writes.
- JWT secret: `config.jwtSecret` (from `@vibestudio/config`) || `process.env.JWT_SECRET`. Refresh tokens use `JWT_REFRESH_SECRET`.

## Frontend (apps/web/src/hooks/useDevAuth.ts)

Always use the `devApi` helper:

```ts
const { user, loading, devApi } = useDevAuth();
await devApi('post', '/tasks', { title });   // → /api/v1/dev-portal/tasks
```

`devApi` sends `withCredentials: true` + the Bearer fallback. `API_URL`
defaults to `http://localhost:4100` (override via `NEXT_PUBLIC_API_URL`).
Do NOT hand-roll an axios call to a dev-portal endpoint — you'll skip the
fallback and 401 in some browsers.

## Roles

`ceo`, `lead`, `product_owner`, plus AI agent roles (`agent_*` /
`ai_agent`). Writes are typically `requireRole('ceo', 'lead', ...)`.

**`ceo` is the super-admin.** It sees **all** projects and can enter **any**
workspace (read + write its tasks/sprints/wiki) regardless of
`dev_project_members`. This is enforced in two places that must stay in sync:
the RLS policies (`app.current_dev_member_role = 'ceo'` bypass, migration 087)
and the route guard `requireProjectMembership(..., role)` (short-circuits for
`ceo`). Everyone else is scoped to the projects they're a member of — including
the `/projects` and `/portfolio` lists (`listProjects`/`getPortfolioStats` take
`(viewerId, role)`).

## Login → workspace landing

After login the app loads `GET /active-project`, which returns the member's
stored `preferences.active_project_id` **iff** it's still a project they can see,
otherwise their first visible (linked) project — so a user always lands in a
workspace they can actually enter. `PUT /active-project` rejects switching to a
project the viewer can't see (non-CEO, non-member → 403).

## DO NOT

- Do NOT validate `acca_token` or import any ACCA auth — it doesn't exist here.
- Do NOT use `resolveOrgId()` / `organization_id` / `getEffectiveOrgId()` — VibeStudio is single-tenant. Scope by `member_id` and RLS (`SET LOCAL app.current_member_id`). See [[vibestudio-database]].
- Do NOT store user data in localStorage beyond the Bearer fallback token.

## Demo login

- Email: `ceo@codes-ai.uk`
- Password: printed at the end of `npm run db:seed` (change on first login).

## Related skills
- [[vibestudio-architecture]]
- [[vibestudio-database]]
- [[vibestudio-session-bootstrap]]
