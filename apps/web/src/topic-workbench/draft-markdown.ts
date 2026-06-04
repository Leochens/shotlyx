import { mergeAttributes, type AnyExtension, type JSONContent } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import {
	getAssetIdFromMarkdownUrl,
	isMarkdownAssetUrl,
	MARKDOWN_ASSET_URL_PREFIX,
} from "@/media/asset-markdown";
import type { MediaAsset } from "@/media/types";
import type { Editor as TiptapEditor } from "@tiptap/core";

export const DRAFT_ASSET_URL_PREFIX = MARKDOWN_ASSET_URL_PREFIX;

const DRAFT_UPLOAD_MIME_PREFIXES = ["image/", "video/"] as const;
const DRAFT_MARKDOWN_INDENTATION = { style: "space", size: 2 } as const;

type HastNode = {
	type: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: HastNode[];
};

function createDraftTiptapBaseExtensions({
	mediaAssets = [],
}: {
	mediaAssets?: MediaAsset[];
} = {}): AnyExtension[] {
	const DraftImage = Image.extend({
		renderHTML({ HTMLAttributes }) {
			const originalSrc =
				typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : "";
			const assetId = getDraftAssetIdFromUrl(originalSrc);
			const asset = assetId
				? mediaAssets.find((currentAsset) => currentAsset.id === assetId)
				: null;
			const previewSrc = asset?.thumbnailUrl || asset?.url || originalSrc;

			return [
				"img",
				mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
					src: previewSrc,
					"data-draft-src": originalSrc,
				}),
			];
		},
	});

	return [
		StarterKit.configure({
			link: {
				openOnClick: false,
				enableClickSelection: true,
				protocols: [{ scheme: "shotlyx-asset" }],
				HTMLAttributes: {
					class:
						"text-primary underline underline-offset-2 cursor-text decoration-primary/40",
				},
				isAllowedUri: (url, context) =>
					isDraftAssetUrl(url) || context.defaultValidate(url),
			},
		}),
		DraftImage.configure({
			allowBase64: true,
			HTMLAttributes: {
				class:
					"my-2 max-h-72 max-w-full rounded-sm border border-border/70 object-contain",
			},
		}),
	];
}

export function createDraftTiptapExtensions({
	mediaAssets = [],
}: {
	mediaAssets?: MediaAsset[];
} = {}): AnyExtension[] {
	return [
		...createDraftTiptapBaseExtensions({ mediaAssets }),
		Markdown.configure({ indentation: DRAFT_MARKDOWN_INDENTATION }),
		Placeholder.configure({
			placeholder:
				"随手写下还没成型的想法、问题、链接、标题碎片或表达冲动",
		}),
	];
}

export function isDraftAssetUrl(url: string | null | undefined): boolean {
	return isMarkdownAssetUrl(url);
}

export function getDraftAssetIdFromUrl(
	url: string | null | undefined,
): string | null {
	return getAssetIdFromMarkdownUrl(url);
}

function escapeMarkdownLabel(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

export function createDraftMarkdownAssetReference({
	asset,
}: {
	asset: MediaAsset;
}): string {
	const label = escapeMarkdownLabel(asset.name || asset.id);
	const url = `${DRAFT_ASSET_URL_PREFIX}${asset.id}`;
	if (asset.type === "image") {
		return `![${label}](${url})`;
	}
	if (asset.type === "video") {
		return `[视频：${label}](${url})`;
	}
	return `[素材：${label}](${url})`;
}

export function buildDraftMarkdownAssetBlock({
	assets,
}: {
	assets: MediaAsset[];
}): string {
	return assets
		.map((asset) => createDraftMarkdownAssetReference({ asset }))
		.join("\n\n");
}

function createDraftMarkdownManager(): MarkdownManager {
	return new MarkdownManager({
		indentation: DRAFT_MARKDOWN_INDENTATION,
		extensions: createDraftTiptapBaseExtensions(),
	});
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function getTiptapNodeText(node: JSONContent): string {
	return (node.content ?? [])
		.map((childNode) =>
			childNode.type === "text"
				? (childNode.text ?? "")
				: getTiptapNodeText(childNode),
		)
		.join("");
}

function renderTiptapTextNode(node: JSONContent): string {
	let html = escapeHtml(node.text ?? "");
	for (const mark of node.marks ?? []) {
		if (mark.type === "bold") {
			html = `<strong>${html}</strong>`;
		} else if (mark.type === "italic") {
			html = `<em>${html}</em>`;
		} else if (mark.type === "strike") {
			html = `<s>${html}</s>`;
		} else if (mark.type === "code") {
			html = `<code>${html}</code>`;
		} else if (mark.type === "link") {
			const href = escapeHtml(String(mark.attrs?.href ?? ""));
			const title = mark.attrs?.title
				? ` title="${escapeHtml(String(mark.attrs.title))}"`
				: "";
			html = `<a href="${href}"${title}>${html}</a>`;
		}
	}
	return html;
}

function renderTiptapChildrenToHtml(node: JSONContent): string {
	return (node.content ?? []).map(renderTiptapNodeToHtml).join("");
}

function renderTiptapNodeToHtml(node: JSONContent): string {
	switch (node.type) {
		case "doc":
			return renderTiptapChildrenToHtml(node);
		case "text":
			return renderTiptapTextNode(node);
		case "paragraph":
			return `<p>${renderTiptapChildrenToHtml(node)}</p>`;
		case "heading": {
			const level = Math.min(
				6,
				Math.max(1, Number(node.attrs?.level ?? 2)),
			);
			return `<h${level}>${renderTiptapChildrenToHtml(node)}</h${level}>`;
		}
		case "blockquote":
			return `<blockquote>${renderTiptapChildrenToHtml(node)}</blockquote>`;
		case "bulletList":
			return `<ul>${renderTiptapChildrenToHtml(node)}</ul>`;
		case "orderedList": {
			const start = Number(node.attrs?.start ?? 1);
			const startAttr = start > 1 ? ` start="${start}"` : "";
			return `<ol${startAttr}>${renderTiptapChildrenToHtml(node)}</ol>`;
		}
		case "listItem":
			return `<li>${renderTiptapChildrenToHtml(node)}</li>`;
		case "codeBlock": {
			const language = node.attrs?.language
				? ` class="language-${escapeHtml(String(node.attrs.language))}"`
				: "";
			return `<pre><code${language}>${escapeHtml(getTiptapNodeText(node))}</code></pre>`;
		}
		case "hardBreak":
			return "<br>";
		case "horizontalRule":
			return "<hr>";
		case "image": {
			const src = escapeHtml(String(node.attrs?.src ?? ""));
			const alt = escapeHtml(String(node.attrs?.alt ?? ""));
			const title = node.attrs?.title
				? ` title="${escapeHtml(String(node.attrs.title))}"`
				: "";
			return `<img src="${src}" alt="${alt}"${title}>`;
		}
		default:
			return renderTiptapChildrenToHtml(node);
	}
}

export function draftMarkdownToTiptapHtml(markdown: string): string {
	const json = createDraftMarkdownManager().parse(markdown);
	return renderTiptapNodeToHtml(json);
}

function getHtmlPropertyValue({
	properties,
	key,
}: {
	properties: Record<string, unknown> | undefined;
	key: string;
}): string {
	const value = properties?.[key];
	if (Array.isArray(value)) return value.join(" ");
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return "";
}

function normalizeMarkdownBlock(value: string): string {
	return value.replace(/\n{3,}/g, "\n\n").trim();
}

function renderInlineHtmlNodeToMarkdown(node: HastNode): string {
	if (node.type === "text") return node.value ?? "";
	if (node.type !== "element") {
		return (node.children ?? []).map(renderInlineHtmlNodeToMarkdown).join("");
	}

	const children = (node.children ?? [])
		.map(renderInlineHtmlNodeToMarkdown)
		.join("");

	switch (node.tagName) {
		case "strong":
		case "b":
			return `**${children}**`;
		case "em":
		case "i":
			return `*${children}*`;
		case "s":
		case "del":
			return `~~${children}~~`;
		case "code":
			return `\`${children}\``;
		case "a": {
			const href = getHtmlPropertyValue({
				properties: node.properties,
				key: "href",
			});
			return href ? `[${children || href}](${href})` : children;
		}
		case "img": {
			const src =
				getHtmlPropertyValue({
					properties: node.properties,
					key: "dataDraftSrc",
				}) ||
				getHtmlPropertyValue({ properties: node.properties, key: "src" });
			const alt = getHtmlPropertyValue({
				properties: node.properties,
				key: "alt",
			});
			return src ? `![${alt}](${src})` : alt;
		}
		case "br":
			return "\n";
		default:
			return children;
	}
}

function renderListItemToMarkdown(node: HastNode): string {
	const content = (node.children ?? [])
		.map(renderHtmlNodeToMarkdown)
		.join("\n")
		.trim()
		.replace(/\n+/g, "\n  ");
	return content;
}

function renderHtmlNodeToMarkdown(node: HastNode): string {
	if (node.type === "root") {
		return normalizeMarkdownBlock(
			(node.children ?? []).map(renderHtmlNodeToMarkdown).join("\n\n"),
		);
	}
	if (node.type === "text") return node.value ?? "";
	if (node.type !== "element") {
		return (node.children ?? []).map(renderHtmlNodeToMarkdown).join("");
	}

	const inlineChildren = (node.children ?? [])
		.map(renderInlineHtmlNodeToMarkdown)
		.join("")
		.trim();
	const blockChildren = (node.children ?? [])
		.map(renderHtmlNodeToMarkdown)
		.join("\n\n")
		.trim();

	switch (node.tagName) {
		case "h1":
		case "h2":
		case "h3":
		case "h4":
		case "h5":
		case "h6": {
			const level = Number(node.tagName.slice(1));
			return `${"#".repeat(level)} ${inlineChildren}`;
		}
		case "p":
			return inlineChildren;
		case "blockquote":
			return blockChildren
				.split("\n")
				.map((line) => `> ${line}`)
				.join("\n");
		case "ul":
			return (node.children ?? [])
				.filter((childNode) => childNode.type === "element")
				.map((childNode) => `- ${renderListItemToMarkdown(childNode)}`)
				.join("\n");
		case "ol":
			return (node.children ?? [])
				.filter((childNode) => childNode.type === "element")
				.map(
					(childNode, index) =>
						`${index + 1}. ${renderListItemToMarkdown(childNode)}`,
				)
				.join("\n");
		case "li":
			return renderListItemToMarkdown(node);
		case "pre":
			return `\`\`\`\n${blockChildren || inlineChildren}\n\`\`\``;
		case "hr":
			return "---";
		case "img":
		case "a":
			return renderInlineHtmlNodeToMarkdown(node);
		default:
			return blockChildren || inlineChildren;
	}
}

export function draftTiptapHtmlToMarkdown(html: string): string {
	const tree = unified().use(rehypeParse, { fragment: true }).parse(html);
	return renderHtmlNodeToMarkdown(tree as HastNode);
}

export function getDraftTiptapMarkdown(editor: TiptapEditor): string {
	const maybeMarkdownEditor = editor as TiptapEditor & {
		getMarkdown?: () => string;
	};
	const markdown = maybeMarkdownEditor.getMarkdown?.();
	if (typeof markdown === "string") return markdown.trim();
	return draftTiptapHtmlToMarkdown(editor.getHTML());
}

export function insertUploadedAssetsIntoTiptap({
	editor,
	assets,
}: {
	editor: TiptapEditor;
	assets: MediaAsset[];
}): void {
	const insertText = buildDraftMarkdownAssetBlock({ assets });
	if (!insertText) return;
	editor
		.chain()
		.focus()
		.insertContent(insertText, { contentType: "markdown" })
		.run();
}

export function insertMarkdownAtRange({
	value,
	insertText,
	selectionStart,
	selectionEnd,
}: {
	value: string;
	insertText: string;
	selectionStart: number;
	selectionEnd: number;
}): string {
	const start = Math.max(0, Math.min(selectionStart, value.length));
	const end = Math.max(start, Math.min(selectionEnd, value.length));
	const before = value.slice(0, start).trimEnd();
	const after = value.slice(end).trimStart();
	const middle = insertText.trim();

	if (!middle) return value;
	if (!before && !after) return middle;
	if (!before) return `${middle}\n\n${after}`;
	if (!after) return `${before}\n\n${middle}`;
	return `${before}\n\n${middle}\n\n${after}`;
}

export function isDraftUploadMediaFile(file: File): boolean {
	return DRAFT_UPLOAD_MIME_PREFIXES.some((prefix) =>
		file.type.startsWith(prefix),
	);
}

export function extractDraftUploadFiles({
	dataTransfer,
}: {
	dataTransfer: DataTransfer | null;
}): File[] {
	if (!dataTransfer) return [];

	const filesFromItems: File[] = [];
	if (dataTransfer.items) {
		for (const item of Array.from(dataTransfer.items)) {
			if (item.kind !== "file") continue;
			const file = item.getAsFile();
			if (file && isDraftUploadMediaFile(file)) {
				filesFromItems.push(file);
			}
		}
	}
	if (filesFromItems.length > 0) return filesFromItems;

	return Array.from(dataTransfer.files ?? []).filter(isDraftUploadMediaFile);
}
