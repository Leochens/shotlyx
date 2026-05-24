# Contributing to Shotlyx

Thanks for taking the time to improve Shotlyx. This project is an AGPL-licensed agent-native video editor with a browser editor, a server-side LLM loop, Rust/WASM support code, and provider-backed media/AI integrations.

## Development Setup

Install dependencies:

```bash
bun install
```

Copy local env:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Start local services when needed:

```bash
docker compose up -d db redis serverless-redis-http
```

Run the web app:

```bash
bun run dev:web
```

## Common Commands

```bash
bun test
bun run lint:web
bun run build:web
cargo test
cd apps/web && bun run test:e2e
```

For focused Agent work, prefer focused tests first, for example:

```bash
bun test apps/web/src/agent
```

## Contribution Rules

- Keep editor mutations undoable when possible by using the command system under `apps/web/src/commands`.
- Keep browser-only editor state in the browser. Server routes should not pretend to own `EditorCore` state.
- Put provider secrets behind server routes or environment variables. Never expose API keys in client bundles or committed files.
- If a tool mutates editor state, set `mutating: true` where appropriate so verification can run.
- Sanitize large or sensitive tool results before sending them back to the model.
- Do not commit `.env.local`, logs, local database files, build outputs, generated reports, or real media from private projects.

## Pull Requests

Please include:

- What changed and why.
- How you tested it.
- Screenshots or short recordings for UI changes when useful.
- Any new environment variables or migration notes.
- Any known limitations.

By contributing, you agree that your contribution can be distributed under this repository's AGPL-3.0-only license.

## Commercial Use

The public code is available under AGPL-3.0-only. For commercial licensing, private integrations, or partnership discussions, use the GuanTou Lab Personal Page:

https://world.guantou.site/
