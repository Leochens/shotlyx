# Flower Text Stickers Implementation Plan

## Goal

Add editable Jianying/CapCut-style flower text as a sticker-panel category, then expose the same presets to AI tools so the assistant can insert them when the user asks for visual emphasis.

## Constraints

- Flower text inserts as `graphic`, not raster `sticker`, so text and styling stay editable.
- Manual sticker panel and AI tools must reuse the same preset catalog.
- Do not hardcode ad hoc timing math; use existing MediaTime helpers/deps or shared constants where timing is needed.
- Preserve unrelated dirty worktree changes and commit only this feature.

## Tasks

1. Add failing coverage for the feature surface.
   - Test flower text definitions render and expose editable params.
   - Test flower text provider browse/search/metadata.
   - Test graphic-backed sticker helper maps flower text to graphic drag data.
   - Test AI list/insert tools and invalid preset rejection.
   - Test prompt guidance mentions conservative flower text usage.

2. Implement the shared flower text catalog.
   - Create reusable preset data with stable IDs, labels, keywords, Chinese aliases, default text, params, and use-case notes.
   - Add graphic definitions with `content`, font/color/stroke/shadow/background params and animation `progress`.
   - Add default progress animations for inserted flower text elements.

3. Wire manual sticker panel support.
   - Add `flower-text` sticker category.
   - Register a dedicated flower text sticker provider.
   - Generalize graphic-backed sticker insertion so shapes and flower text both create graphic elements on click and drag.
   - Keep shapes provider from accidentally listing flower text definitions.

4. Wire AI tools.
   - Add `flower_text_list_presets`.
   - Add `flower_text_insert` with preset ID, content, timing, placement, scale, and optional color fields.
   - Register the tools in MCP server after the MediaTime dependency wrapper exists.
   - Update system prompt guidance for when to use or avoid flower text.

5. Verify and commit.
   - Run targeted Bun tests for new/changed behavior.
   - Run a reasonable broader verification command if feasible.
   - Inspect diff and stage only this feature.
   - Commit the completed implementation.
