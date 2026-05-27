# Local CLI Agent Runtime Report

Date: 2026-05-27
Branch: `codex/local-cli-agent-runtime`

## Scope

This first version lets Shotlyx Desktop choose between the existing provider API runtime and a local CLI runtime. The local runtime currently supports Claude Code and Codex CLI, scans local executables, and reuses the existing Agent ReAct bridge:

1. Agent route sends tool schemas to the model/CLI.
2. Runtime emits a `tool-call` SSE event.
3. Browser executes `editor.mcp.execute(...)`.
4. Browser posts the result back to `/api/agent/chat/[sessionId]/tool-result`.
5. Runtime continues the ReAct loop with that observation.

The editor tools themselves are unchanged.

## Implementation Notes

- Added `apps/web/src/agent/local-cli/runtime.ts`.
- Added desktop config fields: `AGENT_RUNTIME`, `AGENT_CLI_ID`, `AGENT_CLI_MODEL`, `AGENT_CLI_PATH`.
- Added `GET /api/desktop/agents` for Claude Code/Codex CLI detection.
- Added settings UI scan/rescan and click-to-select local CLIs.
- Added local CLI branch inside `/api/agent/chat` while keeping API mode unchanged.
- Added parser support for both direct Shotlyx JSONL protocol lines and wrapped Claude/Codex JSON stream text.

The design follows the Open Design pattern at a smaller scope: a privileged local server scans `PATH`, keeps one adapter per CLI, spawns the selected CLI over stdio, and normalizes stdout back into the same browser-visible event stream.

## API Mode vs Local CLI Mode

| Area | API runtime | Local CLI runtime |
|---|---|---|
| Auth | Requires provider API key in desktop config | Reuses the user's authenticated CLI |
| Login barrier | App still needs key setup | No website account/login required for demo users |
| ReAct ownership | Shotlyx owns the model loop via AI SDK | Shotlyx spawns CLI per turn and asks it to emit JSONL tool calls |
| Editor tools | Existing `editor.mcp.execute` bridge | Same bridge |
| Planning modes | `auto`, `suggest`, `manual`, confirm/continue | Same route paths, local planner used when enabled |
| Streaming | Native AI SDK stream parts | Normalized CLI stdout events |
| Failure modes | API key/model/provider errors | CLI missing, CLI auth expired, CLI argv/stdout format drift |
| Security posture | Provider key stored locally | CLI credentials stay inside the CLI; Shotlyx only stores selected runtime/path/model |

## Coverage

Commands run:

- `bun test apps/web/src/app/api/agent/chat/__tests__/resolve.test.ts apps/web/src/agent/__tests__/mode-resolver.test.ts apps/web/src/desktop/__tests__/config.test.ts apps/web/src/desktop/__tests__/agent-runtime-config.test.ts apps/web/src/agent/local-cli/__tests__/runtime.test.ts apps/web/src/app/api/agent/chat/__tests__/local-cli-route.test.ts`
  - Result: 21 pass, 0 fail.
  - Covers local CLI auto ReAct tool calls, suggest-mode planning, and confirmed-plan summarization.
- `bun run --cwd apps/web test:e2e:desktop`
  - Result: 2 pass, 0 fail.
- `bunx tsc --noEmit --pretty false --project apps/web/tsconfig.json --incremental false | rg "local-cli/runtime|desktop/config/(catalog|server)|settings/api/page|api/desktop/agents/route|api/agent/chat/route" || true`
  - Result: no touched-source TypeScript errors.
- `bunx eslint apps/web/src/agent/local-cli/runtime.ts apps/web/src/app/api/desktop/agents/route.ts apps/web/src/app/settings/api/page.tsx apps/web/src/desktop/config/catalog.ts apps/web/src/desktop/config/server.ts`
  - Result: passed; Next eslint printed the existing "Pages directory cannot be found" warning.

## Remaining Risks

- Real Claude Code/Codex CLI stdout formats can change by version. The parser is tolerant, but this should be tested with real installed CLIs before release.
- Local CLI mode deliberately asks the CLI to output Shotlyx JSONL instead of giving it native filesystem-editing authority. This is safer for the editor, but it means prompt compliance matters.
- Quick-reply action generation is disabled in local CLI mode for v1 so local CLI usage does not accidentally fall back to API keys.
- CLI availability is detected, but auth health is not deeply validated yet. A future version should add `claude`/`codex` auth probes where stable commands exist.
