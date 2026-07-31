import type { ShotlyxRouteKind } from "@/platform/router";

export type AuthGateUser = {
	id: string;
	email: string;
	name: string;
};

export type AuthGateDecision =
	| { kind: "allow" }
	| { kind: "redirect"; href: string };

const PROTECTED_ROUTES = new Set<ShotlyxRouteKind>(["projects", "editor"]);

export function getAuthGateDecision({
	pathname,
	routeKind,
	user,
}: {
	pathname: string;
	routeKind: ShotlyxRouteKind;
	user: AuthGateUser | null;
}): AuthGateDecision {
	if (!PROTECTED_ROUTES.has(routeKind) || user) {
		return { kind: "allow" };
	}
	const next = encodeURIComponent(pathname);
	return { kind: "redirect", href: `/login?next=${next}` };
}
