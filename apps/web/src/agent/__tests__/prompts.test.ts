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
			"ask one concise style/template question when the user has not selected a Remotion preset",
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
		expect(prompt).toContain("Use flower_text_list_presets");
		expect(prompt).toContain("Use flower_text_insert");
		expect(prompt).toContain("conservatively when the user asks for 花字");
		expect(prompt).toContain("Use subtitles_import");
		expect(prompt).toContain("Use subtitles_extract_transcript");
		expect(prompt).toContain("clean transcript text plus timing anchors");
		expect(prompt).toContain('Pass revealMode "karaoke"');
		expect(prompt).toContain("Use subtitles_translate");
		expect(prompt).toContain("Do not use karaoke or token reveal modes");
		expect(prompt).toContain("Use rough_cut_create_review");
		expect(prompt).toContain("subtitles_update_style");
		expect(prompt).toContain("Use agent_generate_voiceover");
		expect(prompt).toContain("自动配音");
		expect(prompt).toContain(
			"When one user request asks for subtitles, voiceover, and MG",
		);
		expect(prompt).toContain(
			"Remotion/Shotlyx Component MG is the only MG generation path",
		);
		expect(prompt).toContain("Do not use HTML/GSAP overlay generators for MG");
		expect(prompt).toContain("never leave placeholder copy");
		expect(prompt).toContain("duration as flexible");
		expect(prompt).toContain("generate subtitles first");
		expect(prompt).toContain("then generate the voiceover");
		expect(prompt).toContain("then create MG from the timed subtitle segments");
		expect(prompt).toContain("If token timing exists");
		expect(prompt).toContain("If only line timing exists");
		expect(prompt).toContain("Use web_search");
		expect(prompt).toContain("Use web_fetch");
		expect(prompt).toContain("Search snippets are leads, not source text");
		expect(prompt).toContain("Use video_semantic_index_analyze");
		expect(prompt).toContain("sub Agent should read Video Semantic Index");
		expect(prompt).toContain(
			"Do not call vision_analyze_media as the first step",
		);
		expect(prompt).toContain("## Vague Editing Requests");
		expect(prompt).toContain("帮我剪辑一下视频");
		expect(prompt).toContain("removing silence");
		expect(prompt).toContain("generating subtitles");
		expect(prompt).toContain("## Complete Video Creation");
		expect(prompt).toContain("media_get_all and timeline_get_summary");
		expect(prompt).toContain("external stock b-roll");
		expect(prompt).toContain("纪录片数据解说");
		expect(prompt).toContain("完整包装：配音+字幕+MG+音效");
		expect(prompt).toContain('stock_search_media with type "video"');
		expect(prompt).toContain('type "audio" and provider "freesound"');
		expect(prompt).toContain("avoid an empty black canvas");
	});
});
