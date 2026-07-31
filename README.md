# Shotlyx

<p align="center">
  <img src="apps/renderer/public/logos/shotlyx/logo.png" alt="Shotlyx logo" width="144" />
</p>

English | [简体中文](README.zh-CN.md)

Shotlyx is a local-first, agent-native desktop video editor for technical
creators. It combines a visual timeline with an optional AI agent that can
inspect project context and execute concrete, reviewable editor tools.

Shotlyx is a desktop application, not a hosted service. Editing, project
storage, local media processing, and the in-process API work without an account
or a Shotlyx backend.

> **Alpha:** the current release line is `v0.1.0-alpha.1`. Project compatibility,
> packaging, and advanced AI workflows may still change.

## What works offline

- Timeline editing, preview, local import, text, subtitles, masks, effects,
  keyframes, audio tools, and export.
- Visible `.shotlyx` project directories stored on the user's computer.
- Local media analysis powered by Rust/WASM and FFmpeg.
- System fonts only; Shotlyx does not download font packs or local AI models.

AI and media-provider integrations are optional. If no Agent is configured, the
editor remains usable and shows the Agent as optional.

## Project storage

The default project library is:

- macOS: `~/Documents/Shotlyx Projects`
- Windows: the user's `Documents\Shotlyx Projects` directory

Each project is a visible directory:

```text
my-project-<id>.shotlyx/
├── project.json
└── media/
    └── managed/
```

Files selected through the native import dialog are linked by default.
Generated, recorded, processed, pasted, and drag-and-drop media are managed
inside the project directory. Linked files can be relinked or consolidated.

See [Project format](docs/PROJECT_FORMAT.md) for details.

## Optional providers

Core adapters:

- Agent LLM: OpenAI, Anthropic, Google, and OpenAI-compatible endpoints.
- Local Agent: Claude Code or Codex CLI.
- ASR: OpenAI-compatible endpoints and Volcengine.
- TTS: OpenAI-compatible endpoints, Edge TTS, and Volcengine.
- Image generation: OpenAI-compatible endpoints.
- Editable motion graphics: Shotlyx MG.

Experimental adapters:

- Kimi visual understanding.
- Seedance video generation.
- Web search/fetch providers.
- Stock media providers.

Provider calls happen only after a user action. API keys are encrypted with
Electron `safeStorage`; readable config files contain only non-secret
preferences. See [Privacy](PRIVACY.md).

## Architecture

```text
apps/desktop     Electron main process, app:// protocol, safeStorage, packaging
apps/renderer    React/Vite editor and local route handlers
packages/local-api
                 In-process request dispatcher used by Electron
packages/shared  Shared cross-package contracts
rust             Rust crates and the WebAssembly package
```

There is no remote Shotlyx backend. Electron serves the renderer and local API
inside the application process. Editor-owned mutations stay in `EditorCore`;
the optional Agent proposes tool calls and the renderer executes them against
the active project.

See [Architecture](docs/ARCHITECTURE.md).

## Development

Requirements:

- Bun `1.2.x`
- Rust stable
- `wasm-pack`
- macOS ARM64 or Windows x64 for the currently supported desktop targets
- A compatible FFmpeg/FFprobe bundle for media processing and packaging

Install and build:

```bash
bun install
bun run build:desktop
```

Run the desktop app:

```bash
bun run dev:desktop
```

Provider credentials are not required. Optional development overrides are
documented in [`apps/renderer/.env.example`](apps/renderer/.env.example).

Useful checks:

```bash
bun test
bun run lint:renderer
cargo test --workspace
bun run build:desktop
```

## Preview packaging

Shotlyx currently targets unsigned, non-notarized preview packages:

```bash
bun run dist:desktop:mac   # macOS ARM64; run on macOS ARM64
bun run dist:desktop:win   # Windows x64; run on Windows x64
```

Packaging never publishes artifacts and there is no auto-updater. Official
release builds must pass the FFmpeg architecture, checksum, source, version, and
license checks described in
[`resources/ffmpeg/README.md`](resources/ffmpeg/README.md). FFmpeg binaries are
not committed to this repository.

## Current limitations

- Alpha packages are unsigned and may trigger operating-system warnings.
- Drag-and-drop cannot reliably expose an absolute source path in the renderer,
  so those files are copied into managed project storage. Use the native import
  button for linked imports.
- No local Whisper or other AI model is bundled.
- Experimental providers may change or be removed.
- macOS Intel and Linux packages are not official targets for this alpha.

## Contributing

Contributions use the Developer Certificate of Origin, not a CLA. Read
[CONTRIBUTING.md](CONTRIBUTING.md), sign commits with `Signed-off-by`, and follow
the [Code of Conduct](CODE_OF_CONDUCT.md).

Security issues should follow [SECURITY.md](SECURITY.md).

## License and attribution

Shotlyx is licensed under
[GNU GPL version 3 only](LICENSE) (`GPL-3.0-only`). There is no dual-license or
CLA requirement.

The Shotlyx name and marks are not granted by the code license. Forks should use
distinct branding; see [TRADEMARK.md](TRADEMARK.md).

Shotlyx includes code derived from OpenCut under the MIT License. Its notice is
preserved in
[`licenses/OpenCut-MIT.txt`](licenses/OpenCut-MIT.txt). See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for distribution notes.
