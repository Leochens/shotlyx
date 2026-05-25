import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	buildRoughCutLinePreviewSegments,
	type RoughCutLinePreviewToken,
} from "@/agent/chat/rough-cut-review-preview";

describe("rough cut review dialog helpers", () => {
	test("builds line preview segments that skip deleted token ranges", () => {
		const tokens: RoughCutLinePreviewToken[] = [
			{
				id: "t1",
				timelineStartSeconds: 1,
				timelineEndSeconds: 1.4,
			},
			{
				id: "t2",
				timelineStartSeconds: 1.4,
				timelineEndSeconds: 1.8,
			},
			{
				id: "t3",
				timelineStartSeconds: 1.8,
				timelineEndSeconds: 2.2,
			},
		];

		const segments = buildRoughCutLinePreviewSegments({
			tokens,
			selectedTokenIds: new Set(["t2"]),
		});

		expect(segments).toEqual([
			{ startSeconds: 1, endSeconds: 1.4 },
			{ startSeconds: 1.8, endSeconds: 2.2 },
		]);
	});

	test("token hover actions are icon-only and close to the token", () => {
		const source = readFileSync(
			new URL("../rough-cut-review-dialog.tsx", import.meta.url),
			"utf8",
		);

		expect(source).toContain("bottom-[calc(100%+0.12rem)]");
		expect(source).toMatch(/<Trash2 className="size-3\.5" \/>\s*<\/button>/);
		expect(source).toMatch(/<Pencil className="size-3\.5" \/>\s*<\/button>/);
		expect(source).not.toMatch(
			/<Trash2 className="size-3\.5" \/>\s*\{selected \? "恢复" : "删除"\}/,
		);
		expect(source).not.toMatch(/<Pencil className="size-3\.5" \/>\s*编辑/);
		expect(source).toContain('aria-label={selected ? "恢复字词" : "删除字词"}');
		expect(source).toContain('aria-label="编辑字词"');
	});
});
