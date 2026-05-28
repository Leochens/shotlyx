# Full Vite React Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Shotlyx from a Next.js-shaped app into a Vite + React app across web, desktop, local APIs, tests, and packaging while preserving current editor, Agent, settings, marketing, and desktop behavior.

**Architecture:** `apps/web` is the Vite React renderer and owns all page routing through `src/platform/router.tsx` plus `src/vite-app.tsx`. API endpoints are plain `Request -> Response` modules under Vite-bundled code, consumed by Vite dev middleware and Electron's `app://shotlyx/api/*` protocol. Next.js packages, config, types, aliases, and lint rules are removed once no source imports `next/*`.

**Tech Stack:** Bun workspaces, Vite, React 19, TypeScript, Tailwind CSS 4, Electron, electron-builder, Playwright visual smoke tests, Bun unit tests.

---

## Current-State Findings

- `apps/client` already loads packaged Vite output through `app://shotlyx` and no longer starts a fixed `127.0.0.1:3100` Next server.
- `apps/web` still has `next`, `@opennextjs/cloudflare`, `@content-collections/next`, `next-themes`, `@next/eslint-plugin-next`, `next.config.ts`, `next-env.d.ts`, and many `next/*` imports.
- API modules still live under `apps/web/src/api/**/route.ts` and import `next/server`.
- The Vite router currently covers the desktop/editor/settings/projects surfaces, but public pages such as `/`, `/blog`, `/changelog`, `/privacy`, `/terms`, `/license`, `/source`, `/brand`, `/roadmap`, `/contributors`, `/sponsors`, and `/third-party-notices` are not all first-class Vite routes.
- Existing e2e coverage validates API settings only; the requested one-image-one-test gate needs screenshots for the primary user surfaces.

## Task 1: Remove Next From The React UI Layer

**Files:**
- Modify: `apps/web/src/platform/router.tsx`
- Modify: `apps/web/src/vite-app.tsx`
- Modify all React files importing `next/link`, `next/image`, `next/navigation`, `next/script`, or `next-themes`
- Modify: `apps/web/src/components/ui/sonner.tsx`

- [ ] Replace UI imports with `@/platform/next-link`, `@/platform/next-image`, `@/platform/router`, `@/platform/next-script`, and `@/platform/next-themes`.
- [ ] Replace `notFound()` usages with Vite-router friendly missing-page rendering.
- [ ] Convert async Next page components used in the Vite renderer into synchronous or hook-backed React components when needed.
- [ ] Expand `matchShotlyxRoute()` and `RouteSwitch` to include the public pages that still exist in `src/app`.
- [ ] Run `rg -n "from ['\"]next/|next/navigation|next/image|next/link|next/script|next-themes" apps/web/src` and verify UI code is clean.
- [ ] Run `bun test apps/web/src/platform/router.test.ts`.

## Task 2: Make API Routes Plain Vite Modules

**Files:**
- Create/Modify: `apps/web/src/platform/http.ts`
- Move or rewrite: `apps/web/src/api/**/route.ts` into `apps/web/src/api/**`
- Modify: `apps/web/src/electron-api/handler.ts`
- Modify tests under `apps/web/src/api/**/__tests__`

- [ ] Create a plain `ApiRequest` and `ApiResponse.json()` compatibility layer with no Next naming.
- [ ] Replace every `next/server` import with `@/platform/http`.
- [ ] Move route files from `src/api/**/route.ts` to `src/api/**` paths and update imports/tests.
- [ ] Update `handleElectronApiRequest()` to import from `src/api/**` paths.
- [ ] Run route tests for agent chat, MG jobs, desktop config reveal, and desktop models.
- [ ] Run `rg -n "next/server|NextRequest|NextResponse|src/api" apps/web/src` and verify no active runtime dependency remains.

## Task 3: Remove Next Build/Config Dependencies

**Files:**
- Delete: `apps/web/next.config.ts`
- Delete: `apps/web/next-env.d.ts`
- Delete: `apps/web/open-next.config.ts`
- Modify: `apps/web/package.json`
- Modify: root `package.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `eslint.config.mjs`
- Modify: `bun.lock`

- [ ] Remove `next`, `next-themes`, `@content-collections/next`, `@opennextjs/cloudflare`, and `@next/eslint-plugin-next`.
- [ ] Replace `preview` and `deploy` scripts with Vite-compatible commands or remove them until a Vite deployment adapter exists.
- [ ] Remove Next plugin/type includes from `tsconfig.json`.
- [ ] Remove Next ESLint plugin wiring from `eslint.config.mjs`.
- [ ] Run `bun install` to refresh `bun.lock`.
- [ ] Run `rg -n "next|opennext|@next|next-env|next.config" package.json apps/web/package.json apps/web/tsconfig.json eslint.config.mjs bun.lock apps/web`.

## Task 4: Add One-Image-One-Test Visual Gates

**Files:**
- Create: `apps/web/e2e/specs/visual-primary-surfaces.spec.ts`
- Create screenshots under Playwright's configured snapshot output

- [ ] Add one screenshot assertion and one functional assertion for `/projects`.
- [ ] Add one screenshot assertion and one functional assertion for `/settings/api`.
- [ ] Add one screenshot assertion and one functional assertion for `/editor/:project_id`.
- [ ] Add one screenshot assertion and one functional assertion for `/`.
- [ ] Run `bun run --cwd apps/web test:e2e` and inspect artifacts if a visual assertion fails.

## Task 5: Final Verification And Packaging

**Commands:**
- `bun test apps/web/src`
- `bun run --cwd apps/web test:e2e`
- `bun run --cwd apps/client build`
- `CSC_IDENTITY_AUTO_DISCOVERY=false bunx electron-builder --dir` from `apps/client`
- `rg -n "next|opennext|@next|next-env|next.config|127\\.0\\.0\\.1:3100|utilityProcess" apps/web apps/client package.json bun.lock eslint.config.mjs`

- [ ] Full Bun test suite passes or every remaining failure is proven unrelated and fixed before completion.
- [ ] Full Playwright e2e suite passes, including visual tests.
- [ ] Web build and desktop API build pass.
- [ ] Electron directory package contains `desktop-web/index.html` and `desktop-api/desktop-api.mjs`.
- [ ] No runtime Next dependency remains.
- [ ] Commit the verified migration.
