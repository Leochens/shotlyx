import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolCallRecord } from "@/agent/controller/types";
import {
	ToolCallGroup,
	buildToolCallSummary,
	getJobTaskProgressItems,
	getStockLicenseDisplay,
	getStockMediaCandidates,
	getStockMediaCandidatesFromToolCalls,
	getToolCallSummaryCounts,
	getToolOutputDisplay,
	getToolStatus,
} from "@/agent/chat/tool-call-card";

describe("tool call card display helpers", () => {
	test("summarizes a mixed tool group with counts instead of an overall status", () => {
		const toolCalls: ToolCallRecord[] = [
			{
				tool: "subtitles_extract_transcript",
				params: {},
				result: { status: "success", data: {} },
			},
			{
				tool: "selection_get_state",
				params: {},
				result: { status: "success", data: {} },
			},
			{
				tool: "timeline_get_summary",
				params: {},
				result: { status: "error", error: "failed" },
			},
		];

		expect(getToolCallSummaryCounts(toolCalls)).toEqual({
			total: 3,
			pending: 0,
			success: 2,
			failed: 1,
		});
		expect(buildToolCallSummary(toolCalls)).toBe(
			"工具调用 · 3 项 · 2 成功 · 1 失败",
		);
	});

	test("renders the tool group with a light-mode card surface", () => {
		const toolCalls: ToolCallRecord[] = [
			{
				tool: "project_get_summary",
				params: {},
				result: { status: "success", data: { name: "Agent测试" } },
			},
		];

		const html = renderToStaticMarkup(
			createElement(ToolCallGroup, { toolCalls }),
		);

		expect(html).toContain("border-border/70");
		expect(html).toContain("bg-card/95");
		expect(html).not.toContain("border-cyan-300/15 bg-neutral-950/55");
	});

	test("includes pending count while tools are still running", () => {
		const toolCalls: ToolCallRecord[] = [
			{
				tool: "subtitles_extract_transcript",
				params: {},
				result: { status: "success", data: {} },
			},
			{
				tool: "timeline_get_summary",
				params: {},
			},
		];

		expect(buildToolCallSummary(toolCalls)).toBe(
			"工具调用 · 2 项 · 1 成功 · 0 失败 · 1 进行中",
		);
	});

	test("groups MG background job progress by parallel task", () => {
		const toolCall: ToolCallRecord = {
			tool: "shotlyx_generate_mg_composition",
			params: { prompt: "生成三层 MG" },
			progress: [
				{
					stage: "generation",
					label: "生成第 1/3 个 MG 组件",
					status: "running",
					taskId: "task-title",
					taskLabel: "标题强调层",
					taskIndex: 0,
					current: 1,
					total: 3,
				},
				{
					stage: "generation",
					label: "已生成标题强调层",
					status: "success",
					taskId: "task-title",
					taskLabel: "标题强调层",
					taskIndex: 0,
					current: 1,
					total: 3,
				},
				{
					stage: "generation",
					label: "生成第 2/3 个 MG 组件",
					status: "running",
					taskId: "task-data",
					taskLabel: "数据主视觉",
					taskIndex: 1,
					current: 2,
					total: 3,
				},
			],
		};

		expect(getJobTaskProgressItems(toolCall)).toEqual([
			{
				id: "task-title",
				label: "标题强调层",
				status: "success",
				detail: "已生成标题强调层",
				index: 0,
				current: 1,
				total: 3,
			},
			{
				id: "task-data",
				label: "数据主视觉",
				status: "running",
				detail: "生成第 2/3 个 MG 组件",
				index: 1,
				current: 2,
				total: 3,
			},
		]);
	});

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

	test("shows streaming vision analysis details while the tool is pending", () => {
		const toolCall: ToolCallRecord = {
			tool: "vision_analyze_media",
			params: { mediaAssetId: "media-1" },
			progress: [
				{
					stage: "vision-output",
					label: "MiniMax M3 正在输出分析结果",
					status: "running",
					detail: "建议保留开场动作，删除中段停顿。",
				},
			],
		};

		expect(getToolOutputDisplay(toolCall)).toEqual({
			tone: "pending",
			text: "建议保留开场动作，删除中段停顿。",
		});
	});

	test("shows large video choice prompts instead of completed vision analysis", () => {
		const toolCall: ToolCallRecord = {
			tool: "vision_analyze_media",
			params: { mediaAssetId: "media-1" },
			result: {
				status: "success",
				data: {
					requiresUserChoice: true,
					message:
						"这个视频约 50.0MiB，超过 MiniMax M3 单次媒体 50MiB 限制。请让用户选择：切分视频后分段分析，或压缩/上传一个小于 50MiB 的视频。",
				},
			},
		};

		expect(getToolOutputDisplay(toolCall)).toEqual({
			tone: "pending",
			text: "这个视频约 50.0MiB，超过 MiniMax M3 单次媒体 50MiB 限制。请让用户选择：切分视频后分段分析，或压缩/上传一个小于 50MiB 的视频。",
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

	test("describes rough cut review as a confirmation step", () => {
		const toolCall: ToolCallRecord = {
			tool: "rough_cut_create_review",
			params: {},
			result: {
				status: "success",
				data: { reviewId: "rough-cut-1" },
			},
		};

		expect(getToolOutputDisplay(toolCall)).toEqual({
			tone: "success",
			text: "粗剪审核单已生成，请在弹窗里确认后再剪辑。",
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
