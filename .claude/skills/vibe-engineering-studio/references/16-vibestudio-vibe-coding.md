---
name: vibestudio-vibe-coding
description: "Use when the user mentions 'vibe coding', 'vibe code', the ⚡ button, or asks how features get built end-to-end in VibeStudio. Vibe Coding is the 7-step flow that wraps task creation → AI prompt generation → code → review → deploy. Lives in apps/web/src/components/layouts/DevPortalLayout.tsx. Read before changing the task or AI-prompt UI."
---

# VibeStudio — Vibe Coding (Prompt-to-Production)

## What it is

The in-house workflow for shipping features: describe a feature in
natural language → the AI Prompt Builder generates a structured prompt
(with module context + rules) → paste into Claude/Cursor/Copilot → AI
writes the code → review → deploy. It is the user-facing wrapper around
what Claude does in chat.

## The 7 steps (source: `DevPortalLayout.tsx`)

| # | Step | What happens |
|---|---|---|
| 1 | Describe | Natural-language feature description. |
| 2 | Create Task | Pick module, type, priority. Creates a `dev_tasks` row. |
| 3 | Generate Prompt | AI Prompt Builder composes the structured prompt ([[vibestudio-prompt-builder]]). |
| 4 | Copy & Paste | Into Claude / Cursor / Copilot. |
| 5 | AI Codes | Migration + route + service + page + sidebar + `logActivity()`. |
| 6 | Review & Test | QA agent + human review. |
| 7 | Deploy | `deploy.sh` on the IONOS VM → systemd restart ([[vibestudio-ionos-deploy]]). |

## Worked example (canonical)

"Add saved board views" → AI generates:
`081_dev_board_views.js`, a service method, a `/api/v1/dev-portal` route,
`apps/web/src/pages/dev-portal/views.tsx`, a sidebar entry, and a
`logActivity()` call. (Keep this in sync with the example in
`DevPortalLayout.tsx`.)

## How to extend

- **Add a step** → edit the 7-step array in `DevPortalLayout.tsx`; update the visual flow + the worked example together.
- **Add a module** → see [[vibestudio-prompt-builder]] (`VIBE_DOMAINS` / `DOMAIN_KB`).
- **Wire a deploy target** → `apps/web/src/pages/dev-portal/deployments.tsx` + `.github/workflows/ci.yml` + [[vibestudio-ionos-deploy]].

## What NOT to do

- Do NOT bypass step 2 — every prompt should have a `dev_tasks` row so prompt history + activity link back.
- Do NOT reference ACCA, accounting domains, or the old `web-platform` paths.

## Status

Inherited from the host app and being modernised. The active direction is
a standalone desktop (.exe) + mobile app with deeper Claude integration —
see [[vibestudio-modernisation-roadmap]].

## Related skills
- [[vibestudio-prompt-builder]]
- [[vibestudio-architecture]]
- [[vibestudio-auth]]
- [[vibestudio-ionos-deploy]]
