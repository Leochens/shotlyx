# Privacy

Shotlyx is a local-first desktop application.

## Data kept on the device

- Projects are stored in visible `.shotlyx` directories.
- Managed media is stored inside the project directory.
- Linked media remains at its original filesystem location.
- Non-secret preferences are stored in Electron's user-data directory.
- API keys are encrypted with Electron `safeStorage`.
- Agent messages and project metadata remain local unless the user invokes an
  external provider.

Shotlyx does not operate an account service or project-sync backend.

## No automatic reporting

Shotlyx contains no product analytics, telemetry, advertising SDK, automatic
crash upload, or auto-update client. It does not silently download fonts, local
AI models, or Whisper models.

## User-triggered network access

Network access can occur only as a consequence of a user action:

- An AI, ASR, TTS, image, video, vision, search, or stock-media command sends
  the requested data to the provider configured by the user.
- A local Claude Code or Codex CLI may access its own provider according to
  that CLI's configuration and privacy terms.
- Importing or previewing a user-selected remote media URL requests that URL.
- Clicking an external documentation or provider link opens the system browser.

Provider requests may contain prompts, selected project context, media, audio,
or URLs needed to perform the requested operation. Review the chosen provider's
terms before enabling it.

## Removing data

Delete a `.shotlyx` directory to remove that project and its managed media.
Linked source files are not deleted. Secrets can be removed from Settings;
uninstalling the app may not remove project directories stored in Documents.

This document describes the `v0.1.0-alpha.1` desktop architecture. Changes that
add new network behavior must update this file.
