# Shotlyx

<p align="center">
  <img src="apps/web/public/logos/shotlyx/logo.png" alt="Shotlyx logo" width="160" />
</p>

[![GuanTou Lab](https://world.guantou.site/badge.svg?theme=dark&accent=red&lang=en&size=sm)](https://world.guantou.site/)

Languages: English | [简体中文](README.zh-CN.md)

Shotlyx is an agent-native video editor: a browser-based editing workspace where an AI assistant can inspect the current project, call editor tools, and make concrete changes to the timeline.

Personal Page: [world.guantou.site](https://world.guantou.site/)

## What It Does

Shotlyx combines a visual timeline editor with an internal tool-calling agent loop. The editor owns the real project state in the browser; the server streams model output and tool-call intent; the browser executes editor-bound tools and sends observations back to the model.

The result is a video editor that can respond to natural language requests such as adding tracks, inserting assets, generating subtitles, searching stock media, creating voiceover, analyzing silence, and producing editable motion graphics.

## Project Lineage

Shotlyx's foundational video editor is based on the OpenCut project, including the core browser editing experience and related editor/runtime foundations.

The Agent layer that makes the editor operable through natural language is original work in this project. This includes the Agent chat experience, execution modes, internal tool-calling loop, editor tool schemas, client-side tool execution bridge, tool-result continuation flow, provider-backed Agent tools, and Shotlyx-specific MG generation workflows.

## Features

- Browser video editor with timeline, preview, media library, text, subtitles, masks, effects, keyframes, and project storage.
- Agent chat panel with `auto`, `suggest`, and `manual` execution modes.
- Internal MCP-like editor tools exposed to the LLM through Vercel AI SDK tool calling.
- Client-side tool execution for browser-only editor state, with server-side streaming and tool-result continuation.
- Stock media search/import, web search/fetch, image generation, voiceover/TTS, ASR-assisted subtitles, and silence removal workflows.
- Shotlyx MG generation for editable Remotion-style motion graphics components.
- Rust/WASM modules for shared time, audio analysis, GPU/compositor, effects, and masks.
- Docker and Cloudflare/OpenNext deployment scaffolding.

## Project Status

This repository is public-readiness work in progress. The web editor and Agent stack are the main active surfaces. The Electron client under `apps/client` wraps the local Next.js app in desktop API mode. The older `apps/desktop` directory is a small GPUI shell prototype, not the current desktop editor.

## Repository Structure

```text
.
├── apps/
│   ├── web/          # Next.js editor app and Agent runtime
│   ├── client/       # Electron desktop client for local API configuration
│   └── desktop/      # Rust GPUI desktop shell prototype
├── rust/
│   ├── crates/       # Shared Rust crates for time, audio, GPU, masks, effects
│   └── wasm/         # wasm-bindgen package used by the web app
├── eslint/           # Local ESLint rules
├── docker-compose.yml
├── package.json
└── Cargo.toml
```

Important web modules:

- `apps/web/src/core`: `EditorCore` and manager initialization.
- `apps/web/src/agent`: chat UI, LLM config, tool adapters, MCP-like server, tool implementations, and Agent tests.
- `apps/web/src/app/api/agent`: server routes for chat streaming, tool-result continuation, MG jobs, stock, web, image, voiceover, and transcription.
- `apps/web/src/commands`: undoable editor commands.
- `apps/web/src/services/storage`: IndexedDB/OPFS project and media storage.
- `apps/web/src/shotlyx/remotion-components`: editable Shotlyx MG generation and validation.

## How The Agent Works

Shotlyx uses a split execution model:

1. The browser sends messages, execution mode, tool schemas, selected references, and brand context to `/api/agent/chat`.
2. The server builds a system prompt and streams a model response using AI SDK `streamText`.
3. When the model calls a tool, the server emits a `tool-call` SSE event instead of mutating editor state directly.
4. The browser receives the tool call and runs `editor.mcp.execute(...)` against the real `EditorCore`.
5. The browser posts the sanitized tool result to `/api/agent/chat/{sessionId}/tool-result`.
6. The server feeds that observation back into the model loop and continues until the task is done or needs confirmation.

This keeps secrets and provider APIs on the server while keeping editor-bound state changes inside the browser runtime where the project actually lives.

## Requirements

- Bun 1.2.x
- Node-compatible runtime for Next.js API routes
- Rust toolchain
- `wasm-pack` for rebuilding the WASM package
- Docker, if you want local Postgres/Redis services
- A modern Chromium-based browser is recommended for the full editor experience

## Quick Start

Install dependencies:

```bash
bun install
```

Start local services:

```bash
docker compose up -d db redis serverless-redis-http
```

Create local env:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Run the web app:

```bash
bun run dev:web
```

Open:

```text
http://localhost:3000
```

Run the Electron desktop client in local API mode:

```bash
bun run dev:client
```

The desktop client opens `/desktop` and enables `SHOTLYX_DESKTOP=1`, so users can
configure their own Agent, video, image, TTS, ASR, web-search, and stock-media
API keys from `/settings/api`. These values are stored in a local desktop config
file and read by the local Next.js server, not by browser localStorage. By
default the Electron client uses `http://127.0.0.1:3100` and a separate
`.next-desktop` build directory so it can run alongside the web dev server on
port 3000.

## Environment Variables

See [apps/web/.env.example](apps/web/.env.example) for the full list. The most common groups are:

- App/server: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Agent LLM: `AGENT_LLM_PROVIDER`, `AGENT_LLM_KEY`, `AGENT_LLM_MODEL`, `AGENT_LLM_HOST`
- MG generation: `AGENT_MG_*`
- Image generation: `IMAGE_GENERATION_*`
- Voiceover/TTS: `VOICEOVER_PROVIDER`, `TTS_GENERATION_*`, or `EDGE_TTS_*`
- ASR: `ASR_*`
- Stock media: `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `FREESOUND_API_KEY`
- Web search/fetch: `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`, `BRAVE_SEARCH_API_KEY`, `JINA_API_KEY`

Do not commit `.env.local` or any real credentials.

## Development Commands

```bash
bun run dev:web        # Next.js dev server
bun run build:web      # Build the web app
bun run build:wasm     # Rebuild Rust/WASM package
bun run lint:web       # Lint web source
bun test               # Run Bun tests
cargo test             # Run Rust tests
```

Web app commands:

```bash
cd apps/web
bun run dev
bun run build
bun run test:e2e
bun run test:e2e:ui
```

## Testing

The repository includes:

- Bun unit tests for Agent, editor utilities, storage migrations, timeline logic, MG generation, and UI helpers.
- Playwright E2E tests for the chat panel, session management, and Agent tool flows.
- Rust unit tests for time, bridge, and audio-analysis crates.
- A focused ESLint rule test under `eslint/rules`.

Before publishing a release, run at least:

```bash
bun test
cargo test
bun run build:web
```

## Deployment

Docker:

```bash
docker compose up --build -d db redis serverless-redis-http server web
```

Default entry points:

- Web: `http://localhost:3100/projects`
- Server: `http://localhost:8787/api/health`
- Admin: `http://localhost:8787/admin`

The compose file is intended for local/self-hosted development. Replace all placeholder secrets before using it for any real deployment. `VITE_SHOTLYX_SERVER_URL` is baked into the web image at build time, so rebuild the `web` service after changing it.

Cloudflare/OpenNext:

```bash
cd apps/web
bun run preview
bun run deploy
```

Several Agent routes use Node runtime behavior, streaming, provider SDKs, and file/binary handling. Verify Cloudflare compatibility for your target feature set before treating a deployment as production-ready.

## License

Shotlyx Community Edition is licensed under [AGPL-3.0-only](LICENSE). Commercial use is permitted only under the AGPL-3.0-only license terms; it is not unconditional commercial permission.

AGPL-3.0-only is a strong copyleft license designed for network/server software: if you run a modified public network version, the license requires you to make the corresponding source available under the same terms.

This AGPL permission does not allow you to keep modified covered code closed, remove required notices, use Shotlyx or GuanTou Lab marks without permission, or operate a modified public network service without providing corresponding source.

If you want to use Shotlyx under a proprietary license, include it in a closed-source product, offer a white-label or hosted deployment without AGPL source obligations, receive private integration support, or discuss enterprise/private deployment, start from the [GuanTou Lab Personal Page](https://world.guantou.site/).

Commercial/proprietary licensing is available only for code and assets for which GuanTou Lab has sufficient licensing rights. See [NOTICE.md](NOTICE.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [COPYRIGHT.md](COPYRIGHT.md), [TRADEMARK.md](TRADEMARK.md), and [CLA.md](CLA.md).

This is practical project guidance, not legal advice.

## Acknowledgements

Shotlyx's base editor originates from OpenCut. The later Agent operation layer and Shotlyx-specific AI editing workflows are original work developed in this project.

OpenCut is licensed under the MIT License, and its license notice is preserved in [licenses/OpenCut-MIT.txt](licenses/OpenCut-MIT.txt).

Some related technical naming still exists, such as `opencut-wasm` and `opencut-graphic-v1`. Public documentation should preserve appropriate upstream attribution and notices while presenting Shotlyx as its own product.

## Contributing

Issues and pull requests are welcome once the public repository is ready. Please read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.
