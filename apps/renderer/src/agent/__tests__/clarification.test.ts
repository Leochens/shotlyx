import { describe, expect, test } from "bun:test";
import { isClarificationRequest } from "@/agent/controller/clarification";

describe("agent clarification", () => {
	test("accepts a model-generated blocking clarification payload", () => {
		expect(
			isClarificationRequest({
				id: "agent-video-angle",
				title: "确认呈现角度",
				question: "这条 AI agent 视频更想强调哪一层？",
				reason: "不同角度会影响脚本结构、案例选择和画面节奏。",
				targetSlot: "video.angle",
				blocking: true,
				allowOther: true,
				options: [
					{
						id: "architecture",
						label: "架构拆解",
						description: "突出模块关系和执行链路",
						value: "我想突出 AI agent 的架构拆解，请继续。",
						recommended: true,
					},
					{
						id: "demo",
						label: "实战演示",
						value: "我想做成实战演示，重点展示运行效果。",
					},
				],
			}),
		).toBe(true);
	});

	test("rejects non-blocking clarification payloads", () => {
		expect(
			isClarificationRequest({
				id: "agent-video-angle",
				title: "确认呈现角度",
				question: "这条 AI agent 视频更想强调哪一层？",
				targetSlot: "video.angle",
				blocking: false,
				allowOther: true,
				options: [
					{
						id: "architecture",
						label: "架构拆解",
						value: "我想突出 AI agent 的架构拆解，请继续。",
					},
				],
			}),
		).toBe(false);
	});

	test("rejects malformed options", () => {
		expect(
			isClarificationRequest({
				id: "agent-video-angle",
				title: "确认呈现角度",
				question: "这条 AI agent 视频更想强调哪一层？",
				targetSlot: "video.angle",
				blocking: true,
				allowOther: true,
				options: [
					{
						id: "architecture",
						label: "架构拆解",
						value: 42,
					},
				],
			}),
		).toBe(false);
	});
});
