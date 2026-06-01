import type { SceneTracks } from "@/timeline";
import { getTrackTypeForElementType } from "@/timeline/placement/compatibility";
import { canPlaceTimeSpansOnTrack } from "@/timeline/placement/overlap";
import type {
	GroupMember,
	GroupMoveResult,
	MoveGroup,
	PlannedElementMove,
	PlannedTrackCreation,
} from "./types";
import {
	getDisplayTracks,
	getTrackPlacementByDisplayIndex,
	getTrackPlacementById,
} from "./track-placement";
import {
	addMediaTime,
	maxMediaTime,
	type MediaTime,
	subMediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

type GroupMoveTarget =
	| {
			kind: "existingTrack";
			anchorTargetTrackId: string;
	  }
	| {
			kind: "newTracks";
			anchorInsertIndex: number;
			newTrackIds: string[];
	  };

interface MemberTrackGroup {
	sourceTrackId: string;
	displayIndex: number;
	trackSection: GroupMember["trackSection"];
	members: GroupMember[];
}

export function resolveGroupMove({
	group,
	tracks,
	anchorStartTime,
	target,
	rippleEditingEnabled = false,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	target: GroupMoveTarget;
	rippleEditingEnabled?: boolean;
}): GroupMoveResult | null {
	if (target.kind === "newTracks") {
		return resolveNewTrackMove({
			group,
			tracks,
			anchorStartTime,
			anchorInsertIndex: target.anchorInsertIndex,
			newTrackIds: target.newTrackIds,
		});
	}

	return resolveExistingTrackMove({
		group,
		tracks,
		anchorStartTime,
		anchorTargetTrackId: target.anchorTargetTrackId,
		rippleEditingEnabled,
	});
}

function resolveExistingTrackMove({
	group,
	tracks,
	anchorStartTime,
	anchorTargetTrackId,
	rippleEditingEnabled,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	anchorTargetTrackId: string;
	rippleEditingEnabled: boolean;
}): GroupMoveResult | null {
	const anchorTargetPlacement = getTrackPlacementById({
		tracks,
		trackId: anchorTargetTrackId,
	});
	if (!anchorTargetPlacement) {
		return null;
	}

	const targetTrackIdsByElementId = resolveExistingTrackIdsByElementId({
		group,
		tracks,
		anchorTargetDisplayIndex: anchorTargetPlacement.displayIndex,
	});
	if (!targetTrackIdsByElementId) {
		return null;
	}

	const clampedAnchorStartTime = clampAnchorStartTime({
		group,
		tracks,
		anchorStartTime,
		targetTrackIdsByElementId,
	});

	const selectedMoves = group.members.map((member) => ({
		sourceTrackId: member.trackId,
		targetTrackId:
			targetTrackIdsByElementId.get(member.elementId) ?? member.trackId,
		elementId: member.elementId,
		newStartTime: addMediaTime({
			a: clampedAnchorStartTime,
			b: member.timeOffset,
		}),
	}));
	const moves = rippleEditingEnabled
		? appendMainTrackRippleMoves({ tracks, group, moves: selectedMoves })
		: selectedMoves;

	if (!canApplyMovesToExistingTracks({ tracks, moves })) {
		return null;
	}

	return {
		moves,
		createTracks: [],
		targetSelection: selectedMoves.map(({ elementId, targetTrackId }) => ({
			trackId: targetTrackId,
			elementId,
		})),
	};
}

function appendMainTrackRippleMoves({
	tracks,
	group,
	moves,
}: {
	tracks: SceneTracks;
	group: MoveGroup;
	moves: PlannedElementMove[];
}): PlannedElementMove[] {
	if (
		moves.length !== group.members.length ||
		moves.some(
			(move) =>
				move.sourceTrackId !== tracks.main.id ||
				move.targetTrackId !== tracks.main.id,
		)
	) {
		return moves;
	}

	const anchorMove = moves.find(
		(move) => move.elementId === group.anchor.elementId,
	);
	const anchorElement = tracks.main.elements.find(
		(element) => element.id === group.anchor.elementId,
	);
	if (!anchorMove || !anchorElement) {
		return moves;
	}

	const deltaTime = subMediaTime({
		a: anchorMove.newStartTime,
		b: anchorElement.startTime,
	});
	if (deltaTime === ZERO_MEDIA_TIME) {
		return moves;
	}

	const movingElementIds = new Set(moves.map((move) => move.elementId));
	const followerMoves = tracks.main.elements
		.filter(
			(element) =>
				!movingElementIds.has(element.id) &&
				element.startTime > anchorElement.startTime,
		)
		.sort(
			(leftElement, rightElement) =>
				leftElement.startTime - rightElement.startTime,
		)
		.map((element) => ({
			sourceTrackId: tracks.main.id,
			targetTrackId: tracks.main.id,
			elementId: element.id,
			newStartTime: addMediaTime({ a: element.startTime, b: deltaTime }),
		}));

	return [...moves, ...followerMoves];
}

function resolveNewTrackMove({
	group,
	tracks,
	anchorStartTime,
	anchorInsertIndex,
	newTrackIds,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	anchorInsertIndex: number;
	newTrackIds: string[];
}): GroupMoveResult | null {
	const sortedTrackGroups = buildMemberTrackGroups({ group });
	const anchorTrackGroupIndex = sortedTrackGroups.findIndex(
		(trackGroup) => trackGroup.sourceTrackId === group.anchor.trackId,
	);
	if (
		anchorTrackGroupIndex < 0 ||
		newTrackIds.length < sortedTrackGroups.length
	) {
		return null;
	}

	const hasAudioMember = sortedTrackGroups.some(
		(trackGroup) => trackGroup.trackSection === "audio",
	);
	const hasNonAudioMember = sortedTrackGroups.some(
		(trackGroup) => trackGroup.trackSection !== "audio",
	);
	if (hasAudioMember && hasNonAudioMember) {
		return null;
	}

	const clampedAnchorStartTime = clampAnchorStartTime({
		group,
		tracks,
		anchorStartTime,
		targetTrackIdsByElementId: new Map(),
	});
	const blockStartIndex = hasAudioMember
		? clampAudioInsertIndex({
				tracks,
				insertIndex: anchorInsertIndex - anchorTrackGroupIndex,
			})
		: Math.max(
				0,
				Math.min(
					anchorInsertIndex - anchorTrackGroupIndex,
					tracks.overlay.length,
				),
			);

	const createTracks: PlannedTrackCreation[] = sortedTrackGroups.flatMap(
		(trackGroup, trackGroupIndex) => {
			const trackType = getTrackTypeForTrackGroup({ trackGroup });
			if (!trackType) {
				return [];
			}

			return [
				{
					id: newTrackIds[trackGroupIndex],
					type: trackType,
					index: blockStartIndex + trackGroupIndex,
				},
			];
		},
	);
	if (createTracks.length !== sortedTrackGroups.length) {
		return null;
	}
	const newTrackIdBySourceTrackId = new Map(
		sortedTrackGroups.map((trackGroup, trackGroupIndex) => [
			trackGroup.sourceTrackId,
			newTrackIds[trackGroupIndex],
		]),
	);
	const moves = sortedTrackGroups.flatMap((trackGroup) =>
		trackGroup.members.map((member) => ({
			sourceTrackId: member.trackId,
			targetTrackId:
				newTrackIdBySourceTrackId.get(trackGroup.sourceTrackId) ??
				member.trackId,
			elementId: member.elementId,
			newStartTime: addMediaTime({
				a: clampedAnchorStartTime,
				b: member.timeOffset,
			}),
		})),
	);

	return {
		moves,
		createTracks,
		targetSelection: moves.map(({ elementId, targetTrackId }) => ({
			trackId: targetTrackId,
			elementId,
		})),
	};
}

function buildMemberTrackGroups({
	group,
}: {
	group: MoveGroup;
}): MemberTrackGroup[] {
	const trackGroupsById = new Map<string, MemberTrackGroup>();
	for (const member of group.members) {
		const trackGroup = trackGroupsById.get(member.trackId);
		if (trackGroup) {
			trackGroup.members.push(member);
			continue;
		}

		trackGroupsById.set(member.trackId, {
			sourceTrackId: member.trackId,
			displayIndex: member.displayIndex,
			trackSection: member.trackSection,
			members: [member],
		});
	}

	return Array.from(trackGroupsById.values()).sort(
		(leftGroup, rightGroup) => leftGroup.displayIndex - rightGroup.displayIndex,
	);
}

function getTrackTypeForTrackGroup({
	trackGroup,
}: {
	trackGroup: MemberTrackGroup;
}) {
	const trackTypes = new Set(
		trackGroup.members.map((member) =>
			getTrackTypeForElementType({ elementType: member.elementType }),
		),
	);
	return trackTypes.size === 1 ? (trackTypes.values().next().value ?? null) : null;
}

function clampAudioInsertIndex({
	tracks,
	insertIndex,
}: {
	tracks: SceneTracks;
	insertIndex: number;
}): number {
	const minimumAudioInsertIndex = tracks.overlay.length + 1;
	return Math.max(
		minimumAudioInsertIndex,
		Math.min(insertIndex, minimumAudioInsertIndex + tracks.audio.length),
	);
}

function resolveExistingTrackIdsByElementId({
	group,
	tracks,
	anchorTargetDisplayIndex,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorTargetDisplayIndex: number;
}): Map<string, string> | null {
	const sortedTrackGroups = buildMemberTrackGroups({ group });
	const anchorTrackGroupIndex = sortedTrackGroups.findIndex(
		(trackGroup) => trackGroup.sourceTrackId === group.anchor.trackId,
	);
	if (anchorTrackGroupIndex < 0) {
		return null;
	}

	const targetTrackIdsByElementId = new Map<string, string>();
	const usedTrackIds = new Set<string>();
	const anchorPlacement = getTrackPlacementByDisplayIndex({
		tracks,
		displayIndex: anchorTargetDisplayIndex,
	});
	if (!anchorPlacement) {
		return null;
	}

	for (const member of sortedTrackGroups[anchorTrackGroupIndex].members) {
		targetTrackIdsByElementId.set(member.elementId, anchorPlacement.trackId);
	}
	usedTrackIds.add(anchorPlacement.trackId);

	let upperBoundaryIndex = anchorTargetDisplayIndex;
	for (
		let trackGroupIndex = anchorTrackGroupIndex - 1;
		trackGroupIndex >= 0;
		trackGroupIndex -= 1
	) {
		const trackGroup = sortedTrackGroups[trackGroupIndex];
		const requiredTrackType = getTrackTypeForTrackGroup({ trackGroup });
		if (!requiredTrackType) {
			return null;
		}
		const targetPlacement = findCompatibleTrackPlacement({
			tracks,
			requiredTrackType,
			startDisplayIndex: upperBoundaryIndex - 1,
			step: -1,
			usedTrackIds,
		});
		if (!targetPlacement) {
			return null;
		}

		for (const member of trackGroup.members) {
			targetTrackIdsByElementId.set(member.elementId, targetPlacement.trackId);
		}
		usedTrackIds.add(targetPlacement.trackId);
		upperBoundaryIndex = targetPlacement.displayIndex;
	}

	let lowerBoundaryIndex = anchorTargetDisplayIndex;
	for (
		let trackGroupIndex = anchorTrackGroupIndex + 1;
		trackGroupIndex < sortedTrackGroups.length;
		trackGroupIndex += 1
	) {
		const trackGroup = sortedTrackGroups[trackGroupIndex];
		const requiredTrackType = getTrackTypeForTrackGroup({ trackGroup });
		if (!requiredTrackType) {
			return null;
		}
		const targetPlacement = findCompatibleTrackPlacement({
			tracks,
			requiredTrackType,
			startDisplayIndex: lowerBoundaryIndex + 1,
			step: 1,
			usedTrackIds,
		});
		if (!targetPlacement) {
			return null;
		}

		for (const member of trackGroup.members) {
			targetTrackIdsByElementId.set(member.elementId, targetPlacement.trackId);
		}
		usedTrackIds.add(targetPlacement.trackId);
		lowerBoundaryIndex = targetPlacement.displayIndex;
	}

	return targetTrackIdsByElementId;
}

function findCompatibleTrackPlacement({
	tracks,
	requiredTrackType,
	startDisplayIndex,
	step,
	usedTrackIds,
}: {
	tracks: SceneTracks;
	requiredTrackType: ReturnType<typeof getTrackTypeForElementType>;
	startDisplayIndex: number;
	step: -1 | 1;
	usedTrackIds: Set<string>;
}) {
	for (
		let displayIndex = startDisplayIndex;
		displayIndex >= 0 &&
		displayIndex < tracks.overlay.length + 1 + tracks.audio.length;
		displayIndex += step
	) {
		const placement = getTrackPlacementByDisplayIndex({
			tracks,
			displayIndex,
		});
		if (!placement) {
			continue;
		}

		if (
			placement.trackType === requiredTrackType &&
			!usedTrackIds.has(placement.trackId)
		) {
			return placement;
		}
	}

	return null;
}

function clampAnchorStartTime({
	group,
	tracks,
	anchorStartTime,
	targetTrackIdsByElementId,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	targetTrackIdsByElementId: Map<string, string>;
}): MediaTime {
	const minimumAnchorStartTime = group.members.reduce(
		(minimumStartTime, member) =>
			member.timeOffset < ZERO_MEDIA_TIME
				? maxMediaTime({
						a: minimumStartTime,
						b: subMediaTime({
							a: ZERO_MEDIA_TIME,
							b: member.timeOffset,
						}),
					})
				: minimumStartTime,
		ZERO_MEDIA_TIME,
	);
	let clampedAnchorStartTime =
		anchorStartTime < minimumAnchorStartTime
			? minimumAnchorStartTime
			: anchorStartTime;

	const memberOnMainTrack = group.members.find(
		(member) =>
			targetTrackIdsByElementId.get(member.elementId) === tracks.main.id,
	);
	if (!memberOnMainTrack) {
		return clampedAnchorStartTime;
	}

	const movingElementIds = new Set(
		group.members.map((member) => member.elementId),
	);
	const requestedMainStartTime = addMediaTime({
		a: clampedAnchorStartTime,
		b: memberOnMainTrack.timeOffset,
	});
	const earliestStationaryMainStartTime = tracks.main.elements
		.filter((element) => !movingElementIds.has(element.id))
		.reduce<MediaTime | null>((earliestStartTime, element) => {
			if (earliestStartTime == null || element.startTime < earliestStartTime) {
				return element.startTime;
			}

			return earliestStartTime;
		}, null);
	if (
		earliestStationaryMainStartTime == null ||
		requestedMainStartTime <= earliestStationaryMainStartTime
	) {
		clampedAnchorStartTime = maxMediaTime({
			a: minimumAnchorStartTime,
			b: subMediaTime({
				a: ZERO_MEDIA_TIME,
				b: memberOnMainTrack.timeOffset,
			}),
		});
	}

	return clampedAnchorStartTime;
}

function canApplyMovesToExistingTracks({
	tracks,
	moves,
}: {
	tracks: SceneTracks;
	moves: PlannedElementMove[];
}): boolean {
	const movingElementIds = new Set(moves.map((move) => move.elementId));
	const sourceElements = new Map(
		getDisplayTracks({ tracks }).flatMap((track) =>
			track.elements.map((element) => [element.id, element] as const),
		),
	);
	const movesByTargetTrackId = new Map<string, PlannedElementMove[]>();
	for (const move of moves) {
		const targetMoves = movesByTargetTrackId.get(move.targetTrackId) ?? [];
		targetMoves.push(move);
		movesByTargetTrackId.set(move.targetTrackId, targetMoves);
	}

	for (const [targetTrackId, targetMoves] of movesByTargetTrackId) {
		const targetPlacement = getTrackPlacementById({
			tracks,
			trackId: targetTrackId,
		});
		if (!targetPlacement) {
			return false;
		}

		const targetTrack = getDisplayTracks({ tracks })[
			targetPlacement.displayIndex
		];
		if (!targetTrack) {
			return false;
		}

		const timeSpans = targetMoves.map((move) => {
			const sourceElement = sourceElements.get(move.elementId);
			return {
				startTime: move.newStartTime,
				duration: sourceElement?.duration ?? ZERO_MEDIA_TIME,
			};
		});
		if (hasOverlappingTimeSpans({ timeSpans })) {
			return false;
		}

		if (
			!canPlaceTimeSpansOnTrack({
				track: {
					elements: targetTrack.elements.filter(
						(element) => !movingElementIds.has(element.id),
					),
				},
				timeSpans,
			})
		) {
			return false;
		}
	}

	return true;
}

function hasOverlappingTimeSpans({
	timeSpans,
}: {
	timeSpans: Array<{ startTime: number; duration: number }>;
}): boolean {
	const sortedSpans = [...timeSpans].sort(
		(leftSpan, rightSpan) => leftSpan.startTime - rightSpan.startTime,
	);

	for (let spanIndex = 1; spanIndex < sortedSpans.length; spanIndex += 1) {
		const previousSpan = sortedSpans[spanIndex - 1];
		const currentSpan = sortedSpans[spanIndex];
		if (
			previousSpan.startTime + previousSpan.duration >
			currentSpan.startTime
		) {
			return true;
		}
	}

	return false;
}
