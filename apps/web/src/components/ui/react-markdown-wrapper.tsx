import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import {
	memo,
	useMemo,
	type AnchorHTMLAttributes,
	type ReactNode,
} from "react";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import {
	getAssetIdFromMarkdownUrl,
	isMarkdownAssetUrl,
} from "@/media/asset-markdown";
import type { MediaAsset } from "@/media/types";
import { cn } from "@/utils/ui";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

const allowedMarkdownElements = [
	"a",
	"br",
	"code",
	"li",
	"ol",
	"p",
	"pre",
	"strong",
	"table",
	"tbody",
	"td",
	"th",
	"thead",
	"tr",
	"ul",
] as const;

const richMarkdownElements = [
	"blockquote",
	"del",
	"em",
	"h1",
	"h2",
	"h3",
	"h4",
	"hr",
	"img",
] as const;

export const ReactMarkdownWrapper = memo(function ReactMarkdownWrapper({
	children,
	inline = false,
	mediaAssets = [],
	rich = false,
}: {
	children: string;
	inline?: boolean;
	mediaAssets?: MediaAsset[];
	rich?: boolean;
}) {
	const mediaAssetById = useMemo(
		() => new Map(mediaAssets.map((asset) => [asset.id, asset])),
		[mediaAssets],
	);
	const allowedElements = rich
		? [...allowedMarkdownElements, ...richMarkdownElements]
		: [...allowedMarkdownElements];

	return (
		<ReactMarkdown
			allowedElements={allowedElements}
			remarkPlugins={[remarkGfm, remarkBreaks]}
			urlTransform={(url) =>
				isMarkdownAssetUrl(url) ? url : defaultUrlTransform(url)
			}
			unwrapDisallowed
			components={{
				a: ({ className: linkClassName, children, node: _node, ...props }) => (
					<MarkdownLink
						className={linkClassName}
						mediaAssetById={mediaAssetById}
						{...props}
					>
						{children}
					</MarkdownLink>
				),
				blockquote: ({
					className: blockquoteClassName,
					node: _node,
					...props
				}) => (
					<blockquote
						className={cn(
							"my-2 border-l-2 border-border pl-3 text-muted-foreground first:mt-0 last:mb-0",
							blockquoteClassName,
						)}
						{...props}
					/>
				),
				em: ({ children }) => <em className="italic">{children}</em>,
				strong: ({ children }) => (
					<strong className="text-foreground font-semibold">{children}</strong>
				),
				h1: ({ className: headingClassName, node: _node, ...props }) => (
					<h1
						className={cn(
							"mb-2 mt-3 text-xl font-semibold leading-7 first:mt-0",
							headingClassName,
						)}
						{...props}
					/>
				),
				h2: ({ className: headingClassName, node: _node, ...props }) => (
					<h2
						className={cn(
							"mb-2 mt-3 text-lg font-semibold leading-7 first:mt-0",
							headingClassName,
						)}
						{...props}
					/>
				),
				h3: ({ className: headingClassName, node: _node, ...props }) => (
					<h3
						className={cn(
							"mb-1.5 mt-3 text-base font-semibold leading-6 first:mt-0",
							headingClassName,
						)}
						{...props}
					/>
				),
				h4: ({ className: headingClassName, node: _node, ...props }) => (
					<h4
						className={cn(
							"mb-1.5 mt-2 text-sm font-semibold leading-6 first:mt-0",
							headingClassName,
						)}
						{...props}
					/>
				),
				hr: ({ className: hrClassName, node: _node, ...props }) => (
					<hr className={cn("my-3 border-border", hrClassName)} {...props} />
				),
				img: ({ className: imageClassName, node: _node, ...props }) => {
					const assetId = getAssetIdFromMarkdownUrl(
						typeof props.src === "string" ? props.src : undefined,
					);
					const asset = assetId ? mediaAssetById.get(assetId) : null;
					const imageSrc =
						asset?.type === "image"
							? (asset.thumbnailUrl ?? asset.url)
							: typeof props.src === "string"
								? props.src
								: undefined;
					if (!imageSrc) {
						return (
							<span className="text-xs text-muted-foreground">
								{props.alt || asset?.name || "图片素材"}
							</span>
						);
					}
					return (
						<img
							className={cn(
								"my-2 max-h-72 w-auto max-w-full rounded-sm border border-border object-contain",
								imageClassName,
							)}
							alt={props.alt || asset?.name || ""}
							loading="lazy"
							{...props}
							src={imageSrc}
						/>
					);
				},
				code: ({
					className: codeClassName,
					children,
					node: _node,
					...props
				}) => (
					<code
						className={cn(
							"rounded border border-destructive/20 bg-destructive/5 px-1.5 py-0.5 font-mono text-[0.85em] text-red-700 dark:text-red-300",
							codeClassName,
						)}
						{...props}
					>
						{children}
					</code>
				),
				li: ({ className: itemClassName, node: _node, ...props }) => (
					<li className={cn("pl-1", itemClassName)} {...props} />
				),
				ol: ({ className: listClassName, node: _node, ...props }) => (
					<ol
						className={cn(
							"my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0",
							listClassName,
						)}
						{...props}
					/>
				),
				p: ({
					className: paragraphClassName,
					children,
					node: _node,
					...props
				}) =>
					inline ? (
						<span className={cn("m-0", paragraphClassName)} {...props}>
							{children}
						</span>
					) : (
						<p
							className={cn("my-1 first:mt-0 last:mb-0", paragraphClassName)}
							{...props}
						>
							{children}
						</p>
					),
				pre: ({ className: preClassName, node: _node, ...props }) => (
					<pre
						className={cn(
							"my-2 overflow-x-auto rounded-md border bg-background/60 p-2 text-xs",
							preClassName,
						)}
						{...props}
					/>
				),
				table: ({ className: tableClassName, node: _node, ...props }) => (
					<Table
						className={cn(
							"my-2 min-w-full border-separate border-spacing-0 overflow-hidden rounded-md border text-xs",
							tableClassName,
						)}
						{...props}
					/>
				),
				tbody: ({ node: _node, ...props }) => <TableBody {...props} />,
				td: ({ className: cellClassName, node: _node, ...props }) => (
					<TableCell
						className={cn(
							"border-border/70 border-b px-2 py-1.5",
							cellClassName,
						)}
						{...props}
					/>
				),
				th: ({ className: headClassName, node: _node, ...props }) => (
					<TableHead
						className={cn(
							"bg-muted/70 h-auto border-b px-2 py-1.5 text-xs font-semibold text-foreground",
							headClassName,
						)}
						{...props}
					/>
				),
				thead: ({ node: _node, ...props }) => <TableHeader {...props} />,
				tr: ({ node: _node, ...props }) => <TableRow {...props} />,
				ul: ({ className: listClassName, node: _node, ...props }) => (
					<ul
						className={cn(
							"my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0",
							listClassName,
						)}
						{...props}
					/>
				),
			}}
		>
			{children}
		</ReactMarkdown>
	);
});

function MarkdownLink({
	children,
	className,
	href,
	mediaAssetById,
	...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
	children: ReactNode;
	mediaAssetById: Map<string, MediaAsset>;
}) {
	const assetId = getAssetIdFromMarkdownUrl(href);
	const asset = assetId ? mediaAssetById.get(assetId) : null;

	if (asset?.type === "video" && asset.url) {
		return (
			<span
				className={cn(
					"my-2 block overflow-hidden rounded-sm border border-border bg-background",
					className,
				)}
			>
				<video
					className="max-h-80 w-full bg-black"
					src={asset.url}
					controls
					preload="metadata"
					poster={asset.thumbnailUrl}
				/>
				<span className="block px-2 py-1.5 text-xs text-muted-foreground">
					视频素材：{asset.name}
				</span>
			</span>
		);
	}

	if (asset) {
		return (
			<span
				className={cn(
					"inline-flex max-w-full items-center rounded-sm border border-border bg-muted/[0.22] px-1.5 py-0.5 text-xs text-muted-foreground",
					className,
				)}
			>
				素材：{asset.name}
			</span>
		);
	}

	return (
		<a
			className={cn("text-primary hover:underline", className)}
			target="_blank"
			rel="noopener noreferrer"
			href={href}
			{...props}
		>
			{children}
		</a>
	);
}
