import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactMarkdownWrapper } from "@/components/ui/react-markdown-wrapper";
import {
	createDraftMarkdownAssetReference,
	insertMarkdownAtRange,
} from "@/topic-workbench/draft-markdown";
import type { MediaAsset } from "@/media/types";

function buildAsset({
	id,
	name,
	type,
	url,
	thumbnailUrl,
}: Pick<MediaAsset, "id" | "name" | "type" | "url" | "thumbnailUrl">) {
	return {
		id,
		name,
		type,
		url,
		thumbnailUrl,
		file: new File([""], name, { type: `${type}/mock` }),
	} satisfies MediaAsset;
}

describe("topic draft Markdown", () => {
	test("creates Markdown references for pasted image and video assets", () => {
		const image = buildAsset({
			id: "image-1",
			name: "草稿图片.png",
			type: "image",
			url: "blob:image-1",
		});
		const video = buildAsset({
			id: "video-1",
			name: "演示视频.mp4",
			type: "video",
			url: "blob:video-1",
			thumbnailUrl: "blob:video-thumb",
		});

		expect(createDraftMarkdownAssetReference({ asset: image })).toBe(
			"![草稿图片.png](shotlyx-asset:image-1)",
		);
		expect(createDraftMarkdownAssetReference({ asset: video })).toBe(
			"[视频：演示视频.mp4](shotlyx-asset:video-1)",
		);
		expect(
			insertMarkdownAtRange({
				value: "第一段想法",
				insertText: "![草稿图片.png](shotlyx-asset:image-1)",
				selectionStart: 5,
				selectionEnd: 5,
			}),
		).toBe("第一段想法\n\n![草稿图片.png](shotlyx-asset:image-1)");
	});

	test("renders rich Markdown and local draft media without broadening chat Markdown", () => {
		const image = buildAsset({
			id: "image-1",
			name: "草稿图片.png",
			type: "image",
			url: "blob:image-1",
			thumbnailUrl: "blob:image-thumb",
		});
		const video = buildAsset({
			id: "video-1",
			name: "演示视频.mp4",
			type: "video",
			url: "blob:video-1",
			thumbnailUrl: "blob:video-thumb",
		});
		const markdown = `## 一个还没成型的想法

> 先把素材和情绪放在这里。

![草稿图片.png](shotlyx-asset:image-1)

[视频：演示视频.mp4](shotlyx-asset:video-1)`;

		const draftHtml = renderToStaticMarkup(
			<ReactMarkdownWrapper rich mediaAssets={[image, video]}>
				{markdown}
			</ReactMarkdownWrapper>,
		);
		const chatHtml = renderToStaticMarkup(
			<ReactMarkdownWrapper>{markdown}</ReactMarkdownWrapper>,
		);

		expect(draftHtml).toContain("<h2");
		expect(draftHtml).toContain("<blockquote");
		expect(draftHtml).toContain('src="blob:image-thumb"');
		expect(draftHtml).toContain("<video");
		expect(draftHtml).toContain('src="blob:video-1"');
		expect(chatHtml).not.toContain("<h2");
		expect(chatHtml).not.toContain("<video");
	});
});
