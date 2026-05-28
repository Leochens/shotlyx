import {
	forwardRef,
	type AnchorHTMLAttributes,
	type MouseEvent,
	type ReactNode,
} from "react";
import { useShotlyxRouter } from "./router";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
	href: string | { pathname?: string; query?: Record<string, string | number> };
	children?: ReactNode;
	replace?: boolean;
	prefetch?: boolean;
};

function toHref(href: LinkProps["href"]): string {
	if (typeof href === "string") return href;
	const pathname = href.pathname ?? "/";
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(href.query ?? {})) {
		query.set(key, String(value));
	}
	const search = query.toString();
	return search ? `${pathname}?${search}` : pathname;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
	{ href, replace, onClick, target, prefetch: _prefetch, children, ...props },
	ref,
) {
	const { navigate } = useShotlyxRouter();
	const resolvedHref = toHref(href);

	const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
		onClick?.(event);
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.altKey ||
			event.ctrlKey ||
			event.shiftKey ||
			target === "_blank" ||
			/^(https?:|mailto:|tel:)/.test(resolvedHref)
		) {
			return;
		}

		event.preventDefault();
		navigate({ href: resolvedHref, replace });
	};

	return (
		<a ref={ref} href={resolvedHref} target={target} onClick={handleClick} {...props}>
			{children}
		</a>
	);
});

export default Link;
