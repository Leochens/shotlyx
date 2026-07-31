import { describe, expect, test } from "bun:test";
import type { AgentMessage } from "@/agent/controller/types";
import {
	getShotlyxMGJobDataFromToolCall,
	getRunningShotlyxMGJobIdsFromMessages,
	isRunningShotlyxMGToolCall,
} from "../mg-job-records";

describe("MG job chat records", () => {
	test("finds running Shotlyx MG jobs and ignores terminal progress", () => {
		const messages: AgentMessage[] = [
			{
				id: "assistant-1",
				role: "assistant",
				content: "",
				timestamp: 1,
				toolCalls: [
					{
						tool: "shotlyx_generate_mg_component",
						params: {},
						result: {
							status: "success",
							data: {
								runtime: "shotlyx-mg-job-v1",
								status: "running",
								jobId: "job-running",
							},
						},
					},
					{
						tool: "shotlyx_generate_mg_component",
						params: {},
						progress: [
							{
								stage: "completed",
								label: "MG 子智能体已完成",
								status: "success",
							},
						],
						result: {
							status: "success",
							data: {
								runtime: "shotlyx-mg-job-v1",
								status: "running",
								jobId: "job-completed",
							},
						},
					},
					{
						tool: "creative_search_video",
						params: {},
						result: { status: "success", data: { jobId: "not-mg" } },
					},
				],
			},
		];

		expect(isRunningShotlyxMGToolCall(messages[0].toolCalls![0]!)).toBe(true);
		expect(
			getShotlyxMGJobDataFromToolCall({
				toolCall: messages[0].toolCalls![0]!,
			}),
		).toMatchObject({
			jobId: "job-running",
			insertToTimeline: false,
			startTimeSeconds: 0,
		});
		expect(getRunningShotlyxMGJobIdsFromMessages({ messages })).toEqual([
			"job-running",
		]);
	});
});
