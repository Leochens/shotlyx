# Contributing to Shotlyx

Thanks for improving Shotlyx. English documentation is canonical; a Chinese
guide is available in [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md).

## Before you start

- Search existing issues before opening a new one.
- Keep pull requests focused and explain user-visible behavior.
- Never include credentials, private media, local project data, or generated
  release artifacts.
- Large architectural changes should start with an issue or design note.

## Development

```bash
bun install
bun run dev:desktop
```

Before requesting review, run the checks relevant to your change:

```bash
bun test
bun run lint:renderer
cargo test --workspace
bun run build:desktop
```

UI changes should include screenshots or a short recording. Storage, migration,
provider, and packaging changes should include focused tests.

## Engineering rules

- Keep editor mutations undoable through the command system where possible.
- Treat `EditorCore` as the owner of active editor state.
- Keep the local API process-bound; do not introduce a hosted backend
  dependency.
- Preserve `.shotlyx` format compatibility or provide an explicit migration.
- Keep secrets in Electron `safeStorage`, never browser storage or readable
  config files.
- Provider requests must follow an explicit user action.
- Do not add telemetry, automatic crash uploads, auto-update, or silently
  downloaded models.
- Add third-party code or assets only with verified license provenance and
  required notices.

## Developer Certificate of Origin

Shotlyx uses the [Developer Certificate of Origin 1.1](DCO.md), not a CLA.
Sign off every commit:

```bash
git commit -s -m "Describe the change"
```

The sign-off certifies that you have the right to contribute the work under
this repository's `GPL-3.0-only` license.

## Pull requests

Include:

- What changed and why.
- How it was tested.
- Migration or compatibility notes.
- New network destinations, provider fields, or third-party notices.
- Known limitations.

By contributing, you agree that your contribution is distributed under
`GPL-3.0-only`.
