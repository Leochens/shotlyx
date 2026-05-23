import { describe, expect, test } from "bun:test";
import { resolveExecutionMode } from "@/agent/controller/mode-resolver";

describe("Mode Resolver", () => {
	test("auto + simple = execute", () => {
		const result = resolveExecutionMode({
			userMode: "auto",
			plan: {
				complexity: "simple",
				reasoning: "",
				steps: [],
				needsConfirmation: false,
			},
		});
		expect(result.strategy).toBe("execute");
	});

	test("auto + complex = suggest", () => {
		const result = resolveExecutionMode({
			userMode: "auto",
			plan: {
				complexity: "complex",
				reasoning: "",
				steps: [],
				needsConfirmation: true,
			},
		});
		expect(result.strategy).toBe("suggest");
	});

	test("suggest always = suggest", () => {
		const result = resolveExecutionMode({
			userMode: "suggest",
			plan: {
				complexity: "simple",
				reasoning: "",
				steps: [],
				needsConfirmation: false,
			},
		});
		expect(result.strategy).toBe("suggest");
	});

	test("manual always = step_by_step", () => {
		const result = resolveExecutionMode({
			userMode: "manual",
			plan: {
				complexity: "simple",
				reasoning: "",
				steps: [],
				needsConfirmation: false,
			},
		});
		expect(result.strategy).toBe("step_by_step");
	});
});
