# Architecture

Shotlyx is one Electron application with an in-process capability layer.

## Runtime boundaries

1. `apps/desktop/main.cjs` starts Electron, registers the `app://shotlyx`
   protocol, and exposes operating-system capabilities such as `safeStorage`.
2. `apps/renderer` contains the React editor and Node-compatible local route
   handlers.
3. `packages/local-api` dispatches `app://shotlyx/api/*` requests to those
   handlers without opening a network port.
4. `EditorCore` owns active project, timeline, media, playback, render, and
   undo/redo state.
5. Rust crates compile to WebAssembly for deterministic time, effects, masks,
   compositing, and audio analysis.

The application has no Shotlyx account, project-sync, telemetry, or deployment
backend.

## Agent execution

The Agent is optional. It can use either a configured provider API or a local
Claude Code/Codex CLI.

The model receives tool schemas and selected context. When it requests a tool,
the renderer executes the tool against `EditorCore`, sanitizes the result, and
continues the local Agent loop. This prevents a model provider from directly
owning or mutating editor state.

Provider adapters are code-level adapters, not dynamically installed plugins.
Experimental adapters are marked in Settings.

## Storage

Project state is saved atomically to `project.json` inside a `.shotlyx`
directory. Per-project writes are serialized. Managed media is stored inside the
project; linked media stores an absolute source path and can be relinked or
consolidated.

Secrets are split from readable preferences and encrypted using Electron
`safeStorage`. Legacy plaintext secrets are migrated when secure storage is
available.

## Network boundary

The local API uses the custom Electron protocol and does not listen on a public
or localhost TCP port in packaged builds. External requests exist only in
user-triggered provider, remote media, and documentation-link workflows.
