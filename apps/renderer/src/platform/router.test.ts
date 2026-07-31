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
			kind: "root",
			params: {},
			pathname: "/desktop",
			search: "",
		});
		expect(matchShotlyxRoute("/")).toEqual({
			kind: "root",
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

	test("does not expose former hosted content routes", () => {
		expect(matchShotlyxRoute("/blog")).toMatchObject({ kind: "not-found" });
		expect(matchShotlyxRoute("/login")).toMatchObject({ kind: "not-found" });
	});
});
