## Summary

-

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Documentation
- [ ] Tests
- [ ] Build/config

## Verification

- [ ] `bun test`
- [ ] `bun run lint:renderer`
- [ ] `cargo test --workspace`
- [ ] `bun run build:desktop`
- [ ] Headless Playwright or manual desktop check
- [ ] Not run; explain why:

## Screenshots / Recordings

Add screenshots or recordings for UI changes when useful.

## Risk Notes

- [ ] Touches Agent prompts/tool calling
- [ ] Touches editor state or undo/redo
- [ ] Touches provider secrets or local API routes
- [ ] Touches storage/migrations
- [ ] Touches licensing/docs/public surface

## Checklist

- [ ] No secrets, private media, local env files, or generated reports are committed.
- [ ] New environment variables are documented in `.env.example`.
- [ ] Public docs are updated when behavior changes.
- [ ] Every commit includes a DCO `Signed-off-by` line.
- [ ] New third-party code, assets, or binaries include verified license provenance.
- [ ] I have described known limitations.
