import { describe, expect, mock, test } from "bun:test";
import { wasmMock } from "@/test/wasm-mock";
import type { MediaTime } from "@/wasm";
import type { GroupResizeMember } from "./types";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => wasmMock);

const { computeGroupResize, computeRollingResize } = await import(
	"./compute-resize"
);

const TICKS_PER_SECOND = 120_000;
const FPS_30 = { numerator: 30, denominator: 1 };

function mt(seconds: number): MediaTime {
	return Math.round(seconds * TICKS_PER_SECOND);
}

function buildSplitClipMember(
	overrides: Partial<GroupResizeMember> = {},
): GroupResizeMember {
	return {
		trackId: "main",
		elementId: "clip",
		startTime: mt(3),
		duration: mt(2),
		trimStart: mt(3),
		trimEnd: mt(5),
		sourceDuration: mt(10),
		leftNeighborBound: null,
		rightNeighborBound: null,
		...overrides,
	};
}

describe("computeGroupResize", () => {
	test("left edge can expand a split clip back into earlier source content", () => {
		const result = computeGroupResize({
			members: [buildSplitClipMember()],
			side: "left",
			deltaTime: mt(-3),
			fps: FPS_30,
		});

		expect(result.updates[0]?.patch).toEqual({
			startTime: mt(0),
			duration: mt(5),
			trimStart: mt(0),
			trimEnd: mt(5),
		});
	});

	test("right edge can expand a split clip into later source content", () => {
		const result = computeGroupResize({
			members: [buildSplitClipMember()],
			side: "right",
			deltaTime: mt(1),
			fps: FPS_30,
		});

		expect(result.updates[0]?.patch).toEqual({
			startTime: mt(3),
			duration: mt(3),
			trimStart: mt(3),
			trimEnd: mt(4),
		});
	});

	test("right edge can roll a continuous split sibling forward", () => {
		const member = {
			...buildSplitClipMember({
				rightNeighborBound: mt(5),
			}),
			sourceKey: "media:interview",
			rightBoundaryNeighbor: {
				...buildSplitClipMember({
					elementId: "right-sibling",
					startTime: mt(5),
					duration: mt(2),
					trimStart: mt(5),
					trimEnd: mt(3),
					leftNeighborBound: mt(5),
				}),
				sourceKey: "media:interview",
			},
		};

		const result = computeGroupResize({
			members: [member],
			side: "right",
			deltaTime: mt(1),
			fps: FPS_30,
		});

		expect(result.updates).toEqual([
			{
				trackId: "main",
				elementId: "clip",
				patch: {
					startTime: mt(3),
					duration: mt(3),
					trimStart: mt(3),
					trimEnd: mt(4),
				},
			},
			{
				trackId: "main",
				elementId: "right-sibling",
				patch: {
					startTime: mt(6),
					duration: mt(1),
					trimStart: mt(6),
					trimEnd: mt(3),
				},
			},
		]);
	});

	test("left edge can roll a continuous split sibling backward", () => {
		const member = {
			...buildSplitClipMember({
				leftNeighborBound: mt(3),
			}),
			sourceKey: "media:interview",
			leftBoundaryNeighbor: {
				...buildSplitClipMember({
					elementId: "left-sibling",
					startTime: mt(1),
					duration: mt(2),
					trimStart: mt(1),
					trimEnd: mt(7),
					rightNeighborBound: mt(3),
				}),
				sourceKey: "media:interview",
			},
		};

		const result = computeGroupResize({
			members: [member],
			side: "left",
			deltaTime: mt(-1),
			fps: FPS_30,
		});

		expect(result.updates).toEqual([
			{
				trackId: "main",
				elementId: "clip",
				patch: {
					startTime: mt(2),
					duration: mt(3),
					trimStart: mt(2),
					trimEnd: mt(5),
				},
			},
			{
				trackId: "main",
				elementId: "left-sibling",
				patch: {
					startTime: mt(1),
					duration: mt(1),
					trimStart: mt(1),
					trimEnd: mt(8),
				},
			},
		]);
	});
});

describe("computeRollingResize", () => {
	test("moves an adjacent edit point right while keeping the occupied span fixed", () => {
		const result = computeRollingResize({
			leftMember: buildSplitClipMember({
				elementId: "a",
				startTime: mt(0),
				duration: mt(5),
				trimStart: mt(0),
				trimEnd: mt(5),
			}),
			rightMember: buildSplitClipMember({
				elementId: "b",
				startTime: mt(5),
				duration: mt(3),
				trimStart: mt(2),
				trimEnd: mt(5),
			}),
			deltaTime: mt(1),
			fps: FPS_30,
		});

		expect(result.updates).toEqual([
			{
				trackId: "main",
				elementId: "a",
				patch: {
					startTime: mt(0),
					duration: mt(6),
					trimStart: mt(0),
					trimEnd: mt(4),
				},
			},
			{
				trackId: "main",
				elementId: "b",
				patch: {
					startTime: mt(6),
					duration: mt(2),
					trimStart: mt(3),
					trimEnd: mt(5),
				},
			},
		]);
	});

	test("moves an adjacent edit point left while keeping the occupied span fixed", () => {
		const result = computeRollingResize({
			leftMember: buildSplitClipMember({
				elementId: "a",
				startTime: mt(0),
				duration: mt(5),
				trimStart: mt(0),
				trimEnd: mt(5),
			}),
			rightMember: buildSplitClipMember({
				elementId: "b",
				startTime: mt(5),
				duration: mt(3),
				trimStart: mt(2),
				trimEnd: mt(5),
			}),
			deltaTime: mt(-2),
			fps: FPS_30,
		});

		expect(result.updates).toEqual([
			{
				trackId: "main",
				elementId: "a",
				patch: {
					startTime: mt(0),
					duration: mt(3),
					trimStart: mt(0),
					trimEnd: mt(7),
				},
			},
			{
				trackId: "main",
				elementId: "b",
				patch: {
					startTime: mt(3),
					duration: mt(5),
					trimStart: mt(0),
					trimEnd: mt(5),
				},
			},
		]);
	});
});
