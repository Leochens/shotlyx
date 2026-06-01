# Flower Text Stickers Design

## Goal

Add CapCut/Jianying-style flower text to Shotlyx in two phases:

1. Users can manually choose flower text from the sticker panel.
2. The AI assistant can later insert the same flower text presets automatically when the user asks for emphasis or short-video packaging.

Flower text should feel like stickers in the asset panel, but behave like editable graphic elements once inserted. The feature must not create a separate AI-only rendering path.

## Current Context

Shotlyx already has a useful base for this:

- The sticker panel is provider-driven and already includes shape, flag, logo, and motion-graphic providers.
- The timeline supports `graphic` elements on graphic tracks.
- Graphic definitions already expose editable params through the properties panel.
- Graphic params and element animations can support light motion such as pop-in, scale bounce, slide-in, and breathing.
- AI tools can insert timeline elements, so the AI phase can reuse the same presets created for manual use.

## Approved Direction

Use option A first, then option C:

- Phase 1: add a dedicated flower text category in the sticker panel.
- Phase 2: expose flower text preset listing and insertion to AI tools.

This keeps the manual workflow stable before automation is added.

## Phase 1: Manual Flower Text Category

### User Experience

The sticker panel gets a new `Flower Text` category. Users can browse presets, search by words such as "highlight", "bubble", "number", "sale", or Chinese equivalents, then drag or click a preset into the timeline.

The first preset set should include 6-10 common styles:

- Emphasis pop: bold outlined text for key phrases.
- Number boost: large number-focused label for growth, price, score, or metrics.
- Exclamation burst: comic-style surprise/attention label.
- Speech bubble: short comment or reaction bubble.
- Price tag: small commercial label for discount, price, or offer text.
- Arrow callout: text with an arrow or pointer for visual annotation.
- Sticker caption: rounded label for short overlay subtitles.
- Completion badge: positive status such as "Done", "New", or "OK".

Each preset appears as a visual card in the flower text category and inserts with a useful default text value. The inserted element can be selected and edited in the properties panel.

### Inserted Element Type

Flower text should insert as a `graphic` element, not as a raster sticker image.

Rationale:

- Text content stays editable.
- Colors, font, stroke, shadow, and background remain editable params.
- Existing graphic rendering and timeline placement can be reused.
- AI can call the same insertion path later.

The sticker panel can still present these as sticker-like items. The provider should return `StickerItem` records with metadata that identifies the backing graphic definition and default params. Drag/drop should detect this metadata and create a `graphic` element instead of a plain `sticker` element.

### Editable Params

Each flower text graphic definition should use shared params where possible:

- `content`: main editable text.
- `fontFamily`: font picker.
- `fontSize`: relative text size.
- `textColor`: fill color.
- `strokeColor` and `strokeWidth`: outline.
- `shadowColor`, `shadowBlur`, `shadowOffsetX`, `shadowOffsetY`: drop shadow.
- `accentColor`: preset-specific highlight or decoration color.
- `backgroundColor`: bubble/tag/backplate color.
- `backgroundOpacity`: for label-style presets.
- `progress`: animation progress from 0 to 1.

Not every preset needs every param in the UI. Shared rendering helpers should keep definitions small and consistent.

### Light Motion

Each preset should include a subtle default animation driven by `progress`:

- Pop/bounce for emphasis and exclamation styles.
- Slide-in for arrow and tag styles.
- Scale pulse or breathing for number highlights.
- Fade/scale for speech bubble and sticker captions.

The animation must be tasteful and short. It should emphasize a phrase without covering the edit with constant motion.

The first implementation can use a `progress` param and optional default keyframes on insert. If creating default keyframes is too broad for phase 1, the definitions can render statically at `progress = 1`, then animation defaults can be added as the next small step.

### Panel Structure

Add a new sticker category key, for example `flower-text`, with label `Flower Text`. The category should use a dedicated provider rather than mixing flower text into the existing motion-graphics provider.

The provider should support:

- `browse`: return all flower text presets with grid layout.
- `search`: match preset name, keywords, Chinese aliases, and default text examples.
- `resolveUrl`: return a preview image URL generated from the backing graphic definition and default params.

## Phase 2: AI Flower Text Tools

### Tooling

Expose two AI-facing capabilities:

1. `flower_text_list_presets`
   - Returns preset IDs, names, keywords, recommended use cases, and editable params.
   - Lets the model choose from the same presets available in the sticker panel.

2. `flower_text_insert`
   - Inserts a flower text preset into the timeline.
   - Inputs: preset ID, text content, start time, duration, position, scale, optional color preference, optional animation style.
   - Output: inserted element ID, track ID, preset metadata, and editable params used.

The tools should create normal `graphic` elements. They should not generate arbitrary SVG, arbitrary Remotion code, or raster images for flower text.

### AI Behavior Rules

The AI should use flower text conservatively:

- Use it when the user explicitly asks for flower text, sticker text, Jianying/CapCut-style pop text, visual emphasis, short-video packaging, or "make key points pop".
- For MG-heavy or social short videos, it may add 2-5 flower text cues at important beats.
- Do not add flower text to ordinary trimming, cleanup, subtitle generation, or neutral editing tasks unless asked.
- Prefer short text: 2-12 Chinese characters or 1-4 English words.
- Do not cover faces, subtitles, important UI, charts, or product details.
- Avoid stacking multiple flower text items at the same time unless the user asks for a dense variety-show style.

### AI Placement Defaults

If the user does not specify placement:

- Key conclusion: center upper third.
- Number highlight: near the number or center-right.
- Speech/reaction bubble: side of the subject, not over the face.
- Price or offer tag: lower third, away from subtitles.
- Arrow callout: near the target region when target coordinates are available; otherwise center-right.

The tool should allow explicit x/y overrides for future workflows that know object positions.

## Data Flow

Manual flow:

1. User opens sticker panel and selects `Flower Text`.
2. Flower text provider returns preset cards.
3. User drags or clicks a preset.
4. Drag/drop reads preset metadata and creates a `graphic` element.
5. The properties panel edits the graphic params.
6. Renderer draws the graphic with current params and animation progress.

AI flow:

1. User asks for emphasis or packaging.
2. AI calls `flower_text_list_presets` when it needs preset awareness.
3. AI selects a preset and calls `flower_text_insert`.
4. Tool creates the same `graphic` element the manual flow would create.
5. User can select and edit the result normally.

## Error Handling

- If a preset ID is unknown, return a clear tool error and do not insert anything.
- If a requested font is unavailable, fall back to the preset default font.
- If a requested duration is invalid, use the default new element duration.
- If insertion overlaps existing graphic elements, use existing automatic graphic-track placement behavior.
- If preview generation fails, show a neutral fallback preview rather than hiding the preset.

## Testing

Phase 1 tests:

- Flower text provider lists all presets.
- Search matches preset names, keywords, and Chinese aliases.
- Sticker item metadata contains the backing graphic definition and params.
- Drag/drop of a flower text item inserts a `graphic` element, not a plain `sticker`.
- At least one graphic definition renders without throwing and exposes editable params.

Phase 2 tests:

- `flower_text_list_presets` returns stable preset IDs and use-case metadata.
- `flower_text_insert` creates a graphic element with the requested text.
- Invalid preset IDs are rejected without timeline mutation.
- AI prompt/tool guidance mentions conservative use and avoids adding flower text to unrelated edits.

## Non-Goals

- No freeform AI-generated flower text art in the first implementation.
- No full template marketplace.
- No raster-only flower text stickers for the core presets.
- No automatic object detection for placement in this scope.
- No dense variety-show automation unless the user explicitly asks for that style.

## Implementation Notes

The cleanest implementation path is:

1. Add shared flower text graphic rendering helpers.
2. Add 6-10 flower text graphic definitions.
3. Add a flower text sticker provider and category.
4. Teach sticker drag/drop to create graphic elements from provider metadata.
5. Add focused tests.
6. Add AI tools and prompt guidance once the manual workflow is stable.

This keeps the first user-visible slice small while preserving the path to AI automation.
