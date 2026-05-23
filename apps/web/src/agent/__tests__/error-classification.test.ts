import { describe, expect, test } from "bun:test";
import {
	classifyError,
	isRetryable,
} from "@/agent/mcp/error-classification";
import type { ErrorCategory } from "@/agent/mcp/error-classification";

describe("classifyError", () => {
	test("classifies 参数格式错误 as param_error", () => {
		const result = classifyError("参数格式错误: startTime 必须为数字");
		expect(result.category).toBe("param_error");
		expect(result.suggestion).toBeDefined();
	});

	test("classifies 类型不匹配 as param_error", () => {
		const result = classifyError("类型不匹配: 期望 string 得到 number");
		expect(result.category).toBe("param_error");
		expect(result.suggestion).toContain("参数类型");
	});

	test("classifies invalid (English) as param_error", () => {
		const result = classifyError("invalid parameter format");
		expect(result.category).toBe("param_error");
	});

	test("classifies 找不到 as not_found", () => {
		const result = classifyError("找不到指定的轨道");
		expect(result.category).toBe("not_found");
		expect(result.suggestion).toContain("timeline_get_summary");
	});

	test("classifies 不存在 as not_found", () => {
		const result = classifyError("该元素不存在");
		expect(result.category).toBe("not_found");
	});

	test("classifies not found (English) as not_found", () => {
		const result = classifyError("Track not found");
		expect(result.category).toBe("not_found");
	});

	test("classifies 尚未 as state_error", () => {
		const result = classifyError("项目尚未加载");
		expect(result.category).toBe("state_error");
		expect(result.suggestion).toContain("编辑器状态");
	});

	test("classifies 无法 as state_error", () => {
		const result = classifyError("无法在当前状态下执行此操作");
		expect(result.category).toBe("state_error");
	});

	test("classifies cannot (English) as state_error", () => {
		const result = classifyError("cannot perform this action");
		expect(result.category).toBe("state_error");
	});

	test("classifies unknown errors as system_error", () => {
		const result = classifyError("something completely unexpected happened");
		expect(result.category).toBe("system_error");
		expect(result.suggestion).toBeUndefined();
	});

	test("returns the original message in all cases", () => {
		const msg = "找不到指定的轨道";
		const result = classifyError(msg);
		expect(result.message).toBe(msg);
	});
});

describe("isRetryable", () => {
	test("param_error is retryable", () => {
		expect(isRetryable("param_error")).toBe(true);
	});

	test("not_found is retryable", () => {
		expect(isRetryable("not_found")).toBe(true);
	});

	test("state_error is not retryable", () => {
		expect(isRetryable("state_error")).toBe(false);
	});

	test("system_error is not retryable", () => {
		expect(isRetryable("system_error")).toBe(false);
	});
});
