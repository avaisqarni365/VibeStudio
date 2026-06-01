# DESIGN_SYSTEM.md — VibeStudio

## Layout principles
- Single workspace shell: `DevPortalLayout` (top bar with multi-project picker
  + ⚡ Vibe Coding panel, collapsible left sidebar grouped Plan&Track /
  Collaborate / AI / Ops, main content).
- Dense, information-first UI. Tailwind utility classes; rounded-xl cards;
  `text-xs` / `text-2xs` body density.

## Palette
- **Indigo** primary (dev-portal accent). Neutral grays for surfaces/borders
  (`border-gray-200`, `bg-gray-50`). Status colors: critical=red, high=orange,
  medium=blue, low=gray; done=emerald, in_progress=blue, review=purple.
- **Dark mode by default** is on the roadmap (currently light).

## Core screens
Home dashboard · Board (Kanban) · Task detail (AI Prompt Builder) · Sprints /
Gantt / Calendar · Prompts library · AI chat · Agents · Team / Portfolio ·
Channels / Inbox · Wiki / Knowledge · Architecture / Project Explorer ·
Deployments / Environments · Settings · Login.

## Reusable components (conventions)
- Card: `bg-white border border-gray-200 rounded-xl p-4`.
- Hero header with gradient per section.
- Status badge, priority dot, progress bar, modal (create/edit), tab bar.
- Sidebar `VIEWS` array drives nav; add an entry per new page.

## Navigation model
Sidebar sections → pages; multi-project picker switches the active project
(all project-scoped data follows). ⚡ panel shows the 7-step Vibe Coding flow.

## Forms & validation
Client validates required fields; server validates with Zod and returns
`{ success, error }`. Inline field errors; disable submit while pending.

## States
Always handle empty (seeded? prompt to create), loading (skeleton/spinner),
and error (toast + retry). "Login OK but board empty" → not seeded.

## Accessibility checklist
- WCAG AA contrast on text + interactive (audit pending with dark mode).
- All interactive elements keyboard-reachable; visible focus ring
  (`focus:ring-2 focus:ring-indigo-500/20`).
- Labels on inputs; aria on icon-only buttons.

## Standards gate (planned — Design Studio)
A "ready-to-code" checklist (tokens used, a11y, security checklist passed)
must be green before a story moves to In Progress.
