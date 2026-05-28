import ReactMarkdown from "react-markdown";
import { memo } from "react";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
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

export const ReactMarkdownWrapper = memo(function ReactMarkdownWrapper({
	children,
	inline = false,
}: {
	children: string;
	inline?: boolean;
}) {
	return (
		<ReactMarkdown
			allowedElements={[...allowedMarkdownElements]}
			remarkPlugins={[remarkGfm, remarkBreaks]}
			unwrapDisallowed
			components={{
				a: ({ className: linkClassName, children, node: _node, ...props }) => (
					<a
						className={cn("text-primary hover:underline", linkClassName)}
						target="_blank"
						rel="noopener noreferrer"
						{...props}
					>
						{children}
					</a>
				),
				strong: ({ children }) => (
					<strong className="text-foreground font-semibold">{children}</strong>
				),
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
