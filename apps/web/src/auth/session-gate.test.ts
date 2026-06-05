import { describe, expect, test } from "bun:test";
import { getAuthGateDecision } from "./session-gate";

describe("auth route gate", () => {
	test("redirects protected routes to login when no user is present", () => {
		expect(
			getAuthGateDecision({
				pathname: "/projects",
				routeKind: "projects",
				user: null,
			}),
		).toEqual({ kind: "redirect", href: "/login?next=%2Fprojects" });

		expect(
			getAuthGateDecision({
				pathname: "/editor/project-1",
				routeKind: "editor",
				user: null,
			}),
		).toEqual({
			kind: "redirect",
			href: "/login?next=%2Feditor%2Fproject-1",
		});
	});

	test("allows public routes and authenticated protected routes", () => {
		expect(
			getAuthGateDecision({
				pathname: "/",
				routeKind: "home",
				user: null,
			}),
		).toEqual({ kind: "allow" });

		expect(
			getAuthGateDecision({
				pathname: "/projects",
				routeKind: "projects",
				user: { id: "user-1", email: "user@example.com", name: "User" },
			}),
		).toEqual({ kind: "allow" });
	});
});
