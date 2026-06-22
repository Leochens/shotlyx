import type { FrameRate } from "opencut-wasm";
import type { ElementRef, RetimeConfig } from "@/timeline/types";
import type { MediaTime } from "@/wasm";

export type ResizeSide = "left" | "right";

export interface GroupResizeMember extends ElementRef {
	startTime: MediaTime;
	duration: MediaTime;
	trimStart: MediaTime;
	trimEnd: MediaTime;
	sourceDuration?: MediaTime;
	sourceKey?: string;
	retime?: RetimeConfig;
	leftNeighborBound: MediaTime | null;
	rightNeighborBound: MediaTime | null;
	leftBoundaryNeighbor?: BoundaryResizeNeighbor;
	rightBoundaryNeighbor?: BoundaryResizeNeighbor;
}

export interface BoundaryResizeNeighbor extends ElementRef {
	startTime: MediaTime;
	duration: MediaTime;
	trimStart: MediaTime;
	trimEnd: MediaTime;
	sourceDuration?: MediaTime;
	sourceKey?: string;
	retime?: RetimeConfig;
}

export interface GroupResizeUpdate extends ElementRef {
	patch: {
		trimStart: MediaTime;
		trimEnd: MediaTime;
		startTime: MediaTime;
		duration: MediaTime;
	};
}

export interface GroupResizeResult {
	deltaTime: MediaTime;
	updates: GroupResizeUpdate[];
}

export interface ComputeGroupResizeArgs {
	members: GroupResizeMember[];
	side: ResizeSide;
	deltaTime: MediaTime;
	fps: FrameRate;
}

export interface ComputeRollingResizeArgs {
	leftMember: GroupResizeMember;
	rightMember: GroupResizeMember;
	deltaTime: MediaTime;
	fps: FrameRate;
}
