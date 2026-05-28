import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export type ShotlyxRouteKind =
	| "home"
	| "projects"
	| "desktop"
	| "settings"
	| "settings-api"
	| "editor"
	| "blog"
	| "blog-post"
	| "brand"
	| "changelog"
	| "changelog-detail"
	| "contributors"
	| "license"
	| "login"
	| "privacy"
	| "roadmap"
	| "source"
	| "sponsors"
	| "terms"
	| "third-party-notices"
	| "not-found";

export type ShotlyxRoute = {
	kind: ShotlyxRouteKind;
	params: Record<string, string>;
	pathname: string;
	search: string;
};

type RouterContextValue = {
	route: ShotlyxRoute;
	navigate: ({ href, replace }: { href: string; replace?: boolean }) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

export class RouteRedirectError extends Error {
	constructor(readonly href: string) {
		super(`Redirect to ${href}`);
		this.name = "RouteRedirectError";
	}
}

export class RouteNotFoundError extends Error {
	constructor() {
		super("Route not found");
		this.name = "RouteNotFoundError";
	}
}

export function redirect(href: string): never {
	if (typeof window !== "undefined") {
		window.location.replace(href);
	}
	throw new RouteRedirectError(href);
}

export function notFound(): never {
	throw new RouteNotFoundError();
}

export function isRouteNotFoundError(error: unknown) {
	return error instanceof RouteNotFoundError;
}

function normalizePathname(pathname: string): string {
	if (!pathname || pathname === "/") return "/";
	const normalized = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
	return normalized || "/";
}

export function matchShotlyxRoute(rawPath: string): ShotlyxRoute {
	const url = new URL(rawPath, "app://shotlyx");
	const pathname = normalizePathname(url.pathname);
	const base = {
		pathname,
		search: url.search,
	};

	if (pathname === "/") {
		return { ...base, kind: "home", params: {} };
	}
	if (pathname === "/projects") {
		return { ...base, kind: "projects", params: {} };
	}
	if (pathname === "/desktop") {
		return { ...base, kind: "desktop", params: {} };
	}
	if (pathname === "/settings") {
		return { ...base, kind: "settings", params: {} };
	}
	if (pathname === "/settings/api") {
		return { ...base, kind: "settings-api", params: {} };
	}
	if (pathname === "/blog") {
		return { ...base, kind: "blog", params: {} };
	}
	const blogPostMatch = /^\/blog\/([^/]+)$/.exec(pathname);
	if (blogPostMatch) {
		return {
			...base,
			kind: "blog-post",
			params: { slug: decodeURIComponent(blogPostMatch[1] ?? "") },
		};
	}
	if (pathname === "/brand") {
		return { ...base, kind: "brand", params: {} };
	}
	if (pathname === "/changelog") {
		return { ...base, kind: "changelog", params: {} };
	}
	const changelogMatch = /^\/changelog\/([^/]+)$/.exec(pathname);
	if (changelogMatch) {
		return {
			...base,
			kind: "changelog-detail",
			params: { version: decodeURIComponent(changelogMatch[1] ?? "") },
		};
	}
	if (pathname === "/contributors") {
		return { ...base, kind: "contributors", params: {} };
	}
	if (pathname === "/license") {
		return { ...base, kind: "license", params: {} };
	}
	if (pathname === "/login") {
		return { ...base, kind: "login", params: {} };
	}
	if (pathname === "/privacy") {
		return { ...base, kind: "privacy", params: {} };
	}
	if (pathname === "/roadmap") {
		return { ...base, kind: "roadmap", params: {} };
	}
	if (pathname === "/source") {
		return { ...base, kind: "source", params: {} };
	}
	if (pathname === "/sponsors") {
		return { ...base, kind: "sponsors", params: {} };
	}
	if (pathname === "/terms") {
		return { ...base, kind: "terms", params: {} };
	}
	if (pathname === "/third-party-notices") {
		return { ...base, kind: "third-party-notices", params: {} };
	}
	const editorMatch = /^\/editor\/([^/]+)$/.exec(pathname);
	if (editorMatch) {
		return {
			...base,
			kind: "editor",
			params: { project_id: decodeURIComponent(editorMatch[1] ?? "") },
		};
	}

	return { ...base, kind: "not-found", params: {} };
}

function currentRoute(): ShotlyxRoute {
	return matchShotlyxRoute(`${window.location.pathname}${window.location.search}`);
}

export function ShotlyxRouterProvider({ children }: { children: ReactNode }) {
	const [route, setRoute] = useState(() => currentRoute());

	useEffect(() => {
		const handlePopState = () => setRoute(currentRoute());
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, []);

	const navigate = useCallback(
		({ href, replace = false }: { href: string; replace?: boolean }) => {
			const url = new URL(href, window.location.href);
			if (url.origin !== window.location.origin) {
				window.location.href = url.href;
				return;
			}
			const nextPath = `${url.pathname}${url.search}${url.hash}`;
			if (replace) {
				window.history.replaceState({}, "", nextPath);
			} else {
				window.history.pushState({}, "", nextPath);
			}
			setRoute(currentRoute());
		},
		[],
	);

	const value = useMemo(() => ({ route, navigate }), [navigate, route]);
	return (
		<RouterContext.Provider value={value}>{children}</RouterContext.Provider>
	);
}

export function useShotlyxRouter() {
	const value = useContext(RouterContext);
	if (!value) {
		throw new Error("useShotlyxRouter must be used inside ShotlyxRouterProvider");
	}
	return value;
}

export function useRouter() {
	const { navigate } = useShotlyxRouter();
	return useMemo(
		() => ({
			push: (href: string) => navigate({ href }),
			replace: (href: string) => navigate({ href, replace: true }),
			back: () => window.history.back(),
			forward: () => window.history.forward(),
			refresh: () => window.dispatchEvent(new PopStateEvent("popstate")),
			prefetch: () => Promise.resolve(),
		}),
		[navigate],
	);
}

export function useParams<T extends Record<string, string> = Record<string, string>>() {
	const { route } = useShotlyxRouter();
	// Mirrors the generic route params API used by migrated components.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return route.params as T;
}

export function usePathname() {
	const { route } = useShotlyxRouter();
	return route.pathname;
}

export function useSearchParams() {
	const { route } = useShotlyxRouter();
	return useMemo(() => new URLSearchParams(route.search), [route.search]);
}
