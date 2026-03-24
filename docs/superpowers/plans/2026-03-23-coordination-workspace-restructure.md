# Coordination Workspace Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the repo into a Bun workspace and replace the fragmented `lobby/` coordination server plus separate React frontend coupling with a standalone `coordination/` package that owns its routes, services, views, and static assets.

**Architecture:** Keep the jam runtime server at the repository root, make the root `package.json` the workspace root, and move the AWS/GitHub coordination app into `coordination/src`. The new coordination package will render landing and dashboard HTML on the server, serve its own CSS/JS from `src/static`, and preserve the existing jam lifecycle, auth, redirect, and webhook behavior.

**Tech Stack:** Bun, TypeScript, Bun.serve, AWS SDK (EC2 and DynamoDB), GitHub OAuth, server-rendered HTML/CSS/JS.

---

### Task 1: Establish workspace boundaries

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `README.md`
- Create: `coordination/package.json`
- Create: `coordination/Dockerfile`
- Create: `coordination/bun.lock`

- [x] Add Bun workspace metadata at the repo root without breaking the existing runtime server scripts.
- [x] Create the standalone `coordination` package definition and Docker build entrypoint.
- [x] Reinstall dependencies and sync the lockfiles expected by the workspace and the coordination package.
- [x] Update top-level docs/scripts so the new coordination package is the canonical server package for lobby/orchestration concerns.

### Task 2: Extract coordination services

**Files:**
- Create: `coordination/src/config.ts`
- Create: `coordination/src/services/ec2.ts`
- Create: `coordination/src/services/jam-records.ts`
- Create: `coordination/src/services/github-oauth.ts`
- Create: `coordination/src/services/user-data.ts`

- [x] Move environment/config parsing into `config.ts`.
- [x] Move EC2 instance launch, lookup, IP resolution, redirect helpers, and health probing into `services/ec2.ts`.
- [x] Move DynamoDB record persistence into `services/jam-records.ts`.
- [x] Move GitHub OAuth request/response helpers into `services/github-oauth.ts`.
- [x] Move EC2 boot/user-data generation into `services/user-data.ts`.

### Task 3: Split routes and server-rendered UI

**Files:**
- Create: `coordination/src/index.ts`
- Create: `coordination/src/routes/auth.ts`
- Create: `coordination/src/routes/jams.ts`
- Create: `coordination/src/routes/pages.ts`
- Create: `coordination/src/views/layout.ts`
- Create: `coordination/src/views/landing.ts`
- Create: `coordination/src/views/dashboard.ts`
- Create: `coordination/src/views/components/jam-card.ts`
- Create: `coordination/src/views/components/status-badge.ts`
- Create: `coordination/src/static/app.css`
- Create: `coordination/src/static/dashboard.js`

- [x] Build a small route dispatcher in `index.ts`.
- [x] Split auth/session endpoints into `routes/auth.ts`.
- [x] Split jam lifecycle, webhook, and redirect routes into `routes/jams.ts`.
- [x] Split document/static/dashboard page serving into `routes/pages.ts`.
- [x] Rebuild the landing/dashboard UI as server-rendered HTML with shared layout and reusable components.
- [x] Move dashboard interactivity into `src/static/dashboard.js`.

### Task 4: Retire the old coordination structure and verify

**Files:**
- Modify or remove: `lobby/*`
- Modify or remove: `client/*`
- Move tests to: `coordination/src/**/*.test.ts`

- [x] Replace old `lobby` references with `coordination`.
- [x] Remove obsolete tests/files or move them under `coordination/src`.
- [x] Run `bun test` for the moved coordination tests.
- [x] Run a coordination package smoke check and a root runtime verification command.
