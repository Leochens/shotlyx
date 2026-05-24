# Security Policy

## Supported Versions

Shotlyx is currently pre-1.0. Security fixes are handled on the main development line unless a release branch is explicitly announced.

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability.

Use one of these channels:

- GitHub private vulnerability reporting, if it is enabled on the public repository.
- GuanTou Lab Personal Page: https://world.guantou.site/

Include:

- A concise description of the issue.
- Affected files, routes, providers, or workflows.
- Reproduction steps.
- Potential impact.
- Any safe proof of concept that does not expose real credentials or user data.

## Sensitive Data Rules

Do not include real API keys, tokens, cookies, private media, private project files, database dumps, or credentials in reports, issues, PRs, logs, screenshots, or test fixtures.

If a credential may have been committed or exposed, rotate it immediately. Removing it from a later commit is not enough if it has already appeared in Git history.

## Scope Notes

Shotlyx includes browser storage, local media processing, provider-backed AI/media APIs, and server-side routes. Security reviews should pay special attention to:

- Secret handling in `apps/web/src/app/api/agent/*`.
- Sanitization of model/tool results.
- SSRF or unsafe URL fetching in web/stock/media routes.
- Large file handling and local media imports.
- IndexedDB/OPFS persistence behavior.
- Generated Remotion/MG component validation.
