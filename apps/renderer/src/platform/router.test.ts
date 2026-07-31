import { describe, expect, test } from "bun:test";
import { matchShotlyxRoute } from "./router";

describe("matchShotlyxRoute", () => {
	test("maps editor URLs to project ids", () => {
		expect(matchShotlyxRoute("/editor/demo-project")).toEqual({
			kind: "editor",
			params: { project_id: "demo-project" },
			pathname: "/editor/demo-project",
			search: "",
		});
	});

	test("decodes encoded editor project ids", () => {
		expect(matchShotlyxRoute("/editor/demo%20project")).toEqual({
			kind: "editor",
			params: { project_id: "demo project" },
			pathname: "/editor/demo%20project",
			search: "",
		});
	});

	test("maps desktop and root URLs to stable pages", () => {
		expect(matchShotlyxRoute("/desktop")).toEqual({
			kind: "desktop",
			params: {},
			pathname: "/desktop",
			search: "",
		});
		expect(matchShotlyxRoute("/")).toEqual({
			kind: "home",
			params: {},
			pathname: "/",
			search: "",
		});
		expect(matchShotlyxRoute("/projects")).toEqual({
			kind: "projects",
			params: {},
			pathname: "/projects",
			search: "",
		});
	});

	test("keeps settings routes distinct", () => {
		expect(matchShotlyxRoute("/settings")).toEqual({
			kind: "settings",
			params: {},
			pathname: "/settings",
			search: "",
		});
		expect(matchShotlyxRoute("/settings/api?section=agent")).toEqual({
			kind: "settings-api",
			params: {},
			pathname: "/settings/api",
			search: "?section=agent",
		});
	});

	test("maps public content routes", () => {
		expect(matchShotlyxRoute("/blog")).toMatchObject({ kind: "blog" });
		expect(matchShotlyxRoute("/blog/hello-world")).toMatchObject({
			kind: "blog-post",
			params: { slug: "hello-world" },
		});
		expect(matchShotlyxRoute("/changelog/v1.0.0")).toMatchObject({
			kind: "changelog-detail",
			params: { version: "v1.0.0" },
		});
		expect(matchShotlyxRoute("/privacy")).toMatchObject({ kind: "privacy" });
		expect(matchShotlyxRoute("/third-party-notices")).toMatchObject({
			kind: "third-party-notices",
		});
	});
});
