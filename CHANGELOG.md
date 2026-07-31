# Changelog

All notable changes to Shotlyx will be documented in this file.

The format follows the spirit of Keep a Changelog, and this project uses GPL-3.0-only licensing unless otherwise stated.

## Unreleased

### Added

- Electron-only local-first desktop architecture.
- Visible `.shotlyx` project directories with linked and managed media.
- Electron `safeStorage` protection and plaintext-secret migration.
- Core and experimental provider capability tiers.
- English canonical documentation and Simplified Chinese contributor guides.
- GPL-3.0-only licensing, DCO contribution terms, and third-party provenance
  guidance.
- FFmpeg architecture, provenance, and checksum release gate.

### Changed

- The editor remains usable without an account, API key, or Shotlyx backend.
- Provider requests are optional and begin only after a user action.
- System fonts replace downloaded font atlases.
- Editable motion previews use a bundled offline runtime.

### Removed

- Hosted backend, account, billing, cloud-sync, deployment, and marketing-site
  paths.
- Legacy GPUI and browser-publication targets.
- Bundled local Whisper, demo remote video search, and unverified third-party
  sample assets.
- Telemetry, automatic crash upload, and auto-update paths.
