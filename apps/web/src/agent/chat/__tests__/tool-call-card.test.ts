import { describe, expect, test } from "bun:test";
import type { ToolCallRecord } from "@/agent/controller/types";
import {
	getStockLicenseDisplay,
	getStockMediaCandidates,
	getStockMediaCandidatesFromToolCalls,
	getToolOutputDisplay,
	getToolStatus,
} from "@/agent/chat/tool-call-card";

describe("tool call card display helpers", () => {
	test("renders a running Shotlyx MG background job as pending output", () => {
		const toolCall: ToolCallRecord = {
			tool: "shotlyx_generate_mg_component",
			params: { prompt: "生成 MG" },
			progress: [
				{
					stage: "generation",
					label: "生成第 1/1 个 MG 组件",
					status: "running",
				},
			],
			result: {
				status: "success",
				data: {
					runtime: "shotlyx-mg-job-v1",
					status: "running",
					jobId: "job-1",
				},
			},
		};

		expect(getToolStatus(toolCall)).toBe("pending");
		expect(getToolOutputDisplay(toolCall)).toEqual({
			tone: "pending",
			text: "MG 子智能体已启动，正在后台生成。",
		});
	});

	test("renders a failed Shotlyx MG background job as an error", () => {
		const toolCall: ToolCallRecord = {
			tool: "shotlyx_generate_mg_component",
			params: { prompt: "生成 MG" },
			progress: [
				{
					stage: "generation",
					label: "MG 子智能体连接失败",
					status: "error",
					detail: "Shotlyx MG job not found",
				},
			],
			result: {
				status: "success",
				data: {
					runtime: "shotlyx-mg-job-v1",
					status: "running",
					jobId: "job-1",
				},
			},
		};

		expect(getToolStatus(toolCall)).toBe("error");
		expect(getToolOutputDisplay(toolCall)).toEqual({
			tone: "error",
			text: "Shotlyx MG job not found",
		});
	});

	test("extracts stock media candidates for card rendering", () => {
		const candidates = getStockMediaCandidates({
			candidates: [
				{
					id: "stock_1",
					provider: "pexels",
					type: "video",
					title: "Office working",
					previewUrl: "https://example.com/preview.mp4",
					thumbnailUrl: "https://example.com/thumb.jpg",
					sourceUrl: "https://example.com/source",
					width: 1920,
					height: 1080,
					durationSeconds: 14,
					author: { name: "RDNE" },
					license: {
						name: "Pexels License",
						commercialUse: true,
						attributionRequired: false,
						derivativesAllowed: true,
					},
				},
				{ title: "missing id" },
			],
		});

		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.id).toBe("stock_1");
		expect(candidates[0]?.author?.name).toBe("RDNE");
		expect(getStockLicenseDisplay(candidates[0]!)).toEqual({
			tone: "safe",
			label: "可直接商用",
			description: "平台授权可商用，无需署名",
		});
	});

	test("marks uncertain stock licenses as warning cards", () => {
		const candidates = getStockMediaCandidates({
			candidates: [
				{
					id: "stock_risk",
					title: "Risky clip",
					license: {
						name: "Unknown",
						commercialUse: false,
					},
				},
			],
		});

		expect(getStockLicenseDisplay(candidates[0]!)).toEqual({
			tone: "warning",
			label: "需确认版权",
			description: "未能确认商用授权，导入前请检查来源条款",
		});
	});

	test("collects stock media candidates from successful tool calls for final results", () => {
		const toolCalls: ToolCallRecord[] = [
			{
				tool: "stock_search_media",
				params: { query: "office" },
				result: {
					status: "success",
					data: {
						candidates: [{ id: "stock_1", title: "Office clip" }],
					},
				},
			},
			{
				tool: "project_get_settings",
				params: {},
				result: { status: "success", data: { width: 1920 } },
			},
			{
				tool: "stock_search_media",
				params: { query: "broken" },
				result: { status: "error", error: "failed" },
			},
		];

		const candidates = getStockMediaCandidatesFromToolCalls(toolCalls);
		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.id).toBe("stock_1");
		expect(candidates[0]?.title).toBe("Office clip");
	});
});
