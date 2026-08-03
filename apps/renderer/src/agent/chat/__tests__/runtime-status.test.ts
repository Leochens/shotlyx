import { describe, expect, test } from "bun:test";
import { formatRuntimeStatusFromValues } from "../runtime-status";

describe("Agent runtime status", () => {
	test("does not report a configured but missing local CLI as ready", () => {
		expect(
			formatRuntimeStatusFromValues({
				values: {
					AGENT_RUNTIME: "local-cli",
					AGENT_CLI_ID: "codex",
				},
				status: [{ id: "agent-runtime", required: true, configured: true }],
				localCliAvailable: false,
			}),
		).toEqual({
			kind: "unconfigured",
			label: "Local CLI unavailable",
			detail: "codex",
		});
	});

	test("reports the selected local CLI only after executable discovery", () => {
		expect(
			formatRuntimeStatusFromValues({
				values: {
					AGENT_RUNTIME: "local-cli",
					AGENT_CLI_ID: "codex",
					AGENT_CLI_MODEL: "default",
				},
				status: [{ id: "agent-runtime", required: true, configured: true }],
				localCliAvailable: true,
			}),
		).toEqual({ kind: "local-cli", label: "Local CLI", detail: "codex" });
	});
});
