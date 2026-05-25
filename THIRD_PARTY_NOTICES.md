# Third-Party Notices

This file records third-party provenance that is important for public
distribution of Shotlyx. It is an index of notable notices, not a complete dump
of every package license in the dependency graph.

## OpenCut

Shotlyx includes code derived from the OpenCut project, including foundational
browser editor and runtime code.

- Project: OpenCut
- License: MIT License
- Copyright 2025-2026 OpenCut
- Preserved license text: [licenses/OpenCut-MIT.txt](licenses/OpenCut-MIT.txt)

## Dependencies

JavaScript, TypeScript, Rust, and deployment dependencies are declared in the
repository manifests, including:

- [package.json](package.json)
- [apps/web/package.json](apps/web/package.json)
- [Cargo.toml](Cargo.toml)
- [apps/desktop/Cargo.toml](apps/desktop/Cargo.toml)
- [rust/wasm/Cargo.toml](rust/wasm/Cargo.toml)
- [rust/crates](rust/crates)

Those packages remain subject to their own license terms and upstream notices.
When distributing Shotlyx binaries, bundled assets, or hosted deployments, verify
the licenses of the exact dependency versions included in that distribution.

## Assets, Fonts, and Generated Media

Do not add third-party media, fonts, templates, example footage, generated
outputs, or vendor files unless their license allows the intended use and any
required attribution is added here or beside the asset.

Stock-media and AI-provider integrations may surface content governed by the
providers' own terms. Imported media and generated outputs are not automatically
covered by the Shotlyx AGPL-3.0-only repository license.
