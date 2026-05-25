import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "@/agent/llm/prompts";

describe("buildSystemPrompt", () => {
	test("does not route arbitrary MG generation through legacy scene graph tools", () => {
		const prompt = buildSystemPrompt({
			toolSchemas: [
				{
					name: "creative_generate_image",
					description: "Generate images",
				},
			],
		});

		expect(prompt).not.toContain("shotlyx_generate_mg_scene");
		expect(prompt).not.toContain("shotlyx_get_mg_scene_schema");
		expect(prompt).not.toContain("shotlyx_update_mg_props");
		expect(prompt).not.toContain("creative_generate_mg_animation");
		expect(prompt).toContain("shotlyx_generate_mg_component");
		expect(prompt).toContain("shotlyx_generate_mg_composition");
		expect(prompt).toContain("Shotlyx Component MG");
		expect(prompt).toContain(
			"Do not ask for style choices just because the user mentioned MG animation",
		);
		expect(prompt).toContain(
			"Do not format stock media candidates as Markdown lists",
		);
		expect(prompt).toContain("structured resource cards");
		expect(prompt).toContain(
			"Audio stock search currently uses Freesound only",
		);
		expect(prompt).toContain("Do not try Pexels or Pixabay for audio search");
		expect(prompt).toContain("configuration_error");
		expect(prompt).toContain("Do not invent or guess CDN/media file URLs");
		expect(prompt).toContain("verify the timeline and media state");
		expect(prompt).toContain("Use timeline_insert_text");
		expect(prompt).toContain("Use timeline_insert_text_overlay");
		expect(prompt).toContain("Use subtitles_import");
		expect(prompt).toContain('Pass revealMode "karaoke"');
		expect(prompt).toContain("Use rough_cut_create_review");
		expect(prompt).toContain("subtitles_update_style");
		expect(prompt).toContain("Use agent_generate_voiceover");
		expect(prompt).toContain("自动配音");
		expect(prompt).toContain("Use web_search");
		expect(prompt).toContain("Use web_fetch");
		expect(prompt).toContain("Search snippets are leads, not source text");
		expect(prompt).toContain("## Vague Editing Requests");
		expect(prompt).toContain("帮我剪辑一下视频");
		expect(prompt).toContain("removing silence");
		expect(prompt).toContain("generating subtitles");
	});
});
