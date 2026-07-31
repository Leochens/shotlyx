# Security Policy

## Supported versions

Shotlyx is pre-1.0. Security fixes are applied to the current development line
until release branches are announced.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub private
vulnerability reporting if it is enabled for the repository, or contact the
maintainer through <https://world.guantou.site/>.

Include a concise description, affected version, reproduction steps, impact,
and a safe proof of concept. Do not attach real API keys, private projects,
credentials, or private media.

## Security boundaries

Reviews should pay particular attention to:

- Electron protocol and local route handling.
- `safeStorage` secret migration and redaction.
- File import, relink, consolidation, and path traversal checks.
- Generated HTML/MG validation.
- Provider URL validation and SSRF exposure.
- Large or malformed media input.
- Local CLI process invocation and inherited environment variables.

Shotlyx has no operated backend, telemetry, crash upload, or auto-update path.
Optional provider and CLI integrations may create their own external security
boundaries.
