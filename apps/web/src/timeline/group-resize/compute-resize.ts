import {
	getSourceSpanAtClipTime,
	getTimelineDurationForSourceSpan,
} from "@/retime";
import {
	addMediaTime,
	clampMediaTime,
	maxMediaTime,
	type MediaTime,
	mediaTime,
	minMediaTime,
	roundFrameTicks,
	roundMediaTime,
	subMediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import type {
	BoundaryResizeNeighbor,
	ComputeGroupResizeArgs,
	ComputeRollingResizeArgs,
	GroupResizeMember,
	GroupResizeResult,
	GroupResizeUpdate,
	ResizeSide,
} from "./types";

export function computeGroupResize({
	members,
	side,
	deltaTime,
	fps,
}: ComputeGroupResizeArgs): GroupResizeResult {
	if (members.length === 0) {
		return { deltaTime: ZERO_MEDIA_TIME, updates: [] };
	}

	const minDuration = mediaTime({
		ticks: Math.round((TICKS_PER_SECOND * fps.denominator) / fps.numerator),
	});
	let minimumDeltaTime = getMinimumAllowedDeltaTime({
		member: members[0],
		side,
		minDuration,
	});
	let maximumDeltaTime = getMaximumAllowedDeltaTime({
		member: members[0],
		side,
		minDuration,
	});

	for (const member of members.slice(1)) {
		minimumDeltaTime = maxMediaTime({
			a: minimumDeltaTime,
			b: getMinimumAllowedDeltaTime({
				member,
				side,
				minDuration,
			}),
		});
		const memberMaximum = getMaximumAllowedDeltaTime({
			member,
			side,
			minDuration,
		});
		if (memberMaximum !== null) {
			maximumDeltaTime =
				maximumDeltaTime === null
					? memberMaximum
					: minMediaTime({ a: maximumDeltaTime, b: memberMaximum });
		}
	}

	const clampedDeltaTime =
		maximumDeltaTime === null
			? maxMediaTime({ a: minimumDeltaTime, b: deltaTime })
			: clampMediaTime({
					time: deltaTime,
					min: minimumDeltaTime,
					max: maximumDeltaTime,
				});

	// Snap the drag delta to a frame exactly once, then derive every patch
	// field from that single snapped value. This keeps the invariant
	// `trimStart + duration*rate + trimEnd == sourceDuration` exact: the same
	// delta is added on one side of the element and removed from the other,
	// so the rounding cancels by construction. Per-field rounding (the old
	// approach) couldn't preserve this because the individual rounds don't
	// compose when `sourceDuration` isn't frame-aligned.
	const snappedDeltaTime = mediaTime({
		ticks: roundFrameTicks({ ticks: clampedDeltaTime, fps }),
	});
	// Re-clamp after rounding. Bounds derived from other elements are
	// frame-aligned, so this is normally a no-op; at the source-extent limit
	// the bound may not be frame-aligned, and honouring the bound takes
	// precedence over frame alignment (you can't extend past real content).
	const finalDeltaTime =
		maximumDeltaTime === null
			? maxMediaTime({ a: minimumDeltaTime, b: snappedDeltaTime })
			: clampMediaTime({
					time: snappedDeltaTime,
					min: minimumDeltaTime,
					max: maximumDeltaTime,
				});

	return {
		deltaTime: Object.is(finalDeltaTime, -0) ? ZERO_MEDIA_TIME : finalDeltaTime,
		updates: members.map((member) =>
			buildResizeUpdates({
				member,
				side,
				deltaTime: finalDeltaTime,
			}),
		).flat(),
	};
}

export function computeRollingResize({
	leftMember,
	rightMember,
	deltaTime,
	fps,
}: ComputeRollingResizeArgs): GroupResizeResult {
	const minDuration = mediaTime({
		ticks: Math.round((TICKS_PER_SECOND * fps.denominator) / fps.numerator),
	});
	const minimumDeltaTime = maxMediaTime({
		a: subMediaTime({ a: minDuration, b: leftMember.duration }),
		b: subMediaTime({
			a: ZERO_MEDIA_TIME,
			b: getLeftExtensionCapacity({
				member: rightMember,
			}),
		}),
	});
	const maximumDeltaTime = minMediaTime({
		a: subMediaTime({ a: rightMember.duration, b: minDuration }),
		b: getRightExtensionCapacity({
			member: leftMember,
		}),
	});
	const clampedDeltaTime = clampMediaTime({
		time: deltaTime,
		min: minimumDeltaTime,
		max: maximumDeltaTime,
	});
	const snappedDeltaTime = mediaTime({
		ticks: roundFrameTicks({ ticks: clampedDeltaTime, fps }),
	});
	const finalDeltaTime = clampMediaTime({
		time: snappedDeltaTime,
		min: minimumDeltaTime,
		max: maximumDeltaTime,
	});

	return {
		deltaTime: Object.is(finalDeltaTime, -0) ? ZERO_MEDIA_TIME : finalDeltaTime,
		updates: [
			buildRollingLeftUpdate({
				member: leftMember,
				deltaTime: finalDeltaTime,
			}),
			buildRollingRightUpdate({
				member: rightMember,
				deltaTime: finalDeltaTime,
			}),
		],
	};
}

function buildRollingLeftUpdate({
	member,
	deltaTime,
}: {
	member: GroupResizeMember;
	deltaTime: MediaTime;
}): GroupResizeUpdate {
	const sourceDelta = getSourceDeltaForClipDelta({
		member,
		clipDelta: deltaTime,
	});

	return {
		trackId: member.trackId,
		elementId: member.elementId,
		patch: {
			trimStart: member.trimStart,
			trimEnd: maxMediaTime({
				a: ZERO_MEDIA_TIME,
				b: subMediaTime({ a: member.trimEnd, b: sourceDelta }),
			}),
			startTime: member.startTime,
			duration: addMediaTime({ a: member.duration, b: deltaTime }),
		},
	};
}

function buildRollingRightUpdate({
	member,
	deltaTime,
}: {
	member: GroupResizeMember;
	deltaTime: MediaTime;
}): GroupResizeUpdate {
	const sourceDelta = getSourceDeltaForClipDelta({
		member,
		clipDelta: deltaTime,
	});

	return {
		trackId: member.trackId,
		elementId: member.elementId,
		patch: {
			trimStart: maxMediaTime({
				a: ZERO_MEDIA_TIME,
				b: addMediaTime({ a: member.trimStart, b: sourceDelta }),
			}),
			trimEnd: member.trimEnd,
			startTime: addMediaTime({ a: member.startTime, b: deltaTime }),
			duration: subMediaTime({ a: member.duration, b: deltaTime }),
		},
	};
}

function getLeftExtensionCapacity({
	member,
}: {
	member: GroupResizeMember;
}): MediaTime {
	return subMediaTime({
		a: getDurationForVisibleSourceSpan({
			member,
			sourceSpan: addMediaTime({
				a: getVisibleSourceSpanForDuration({
					member,
					duration: member.duration,
				}),
				b: member.trimStart,
			}),
		}),
		b: member.duration,
	});
}

function getRightExtensionCapacity({
	member,
}: {
	member: GroupResizeMember;
}): MediaTime {
	if (member.sourceDuration == null) return member.trimEnd;
	const maximumVisibleSourceSpan = subMediaTime({
		a: getSourceDuration({ member }),
		b: member.trimStart,
	});
	const maximumDuration = getDurationForVisibleSourceSpan({
		member,
		sourceSpan: maximumVisibleSourceSpan,
	});
	return subMediaTime({
		a: maximumDuration,
		b: member.duration,
	});
}

function buildResizeUpdates({
	member,
	side,
	deltaTime,
}: {
	member: GroupResizeMember;
	side: ResizeSide;
	deltaTime: MediaTime;
}): GroupResizeUpdate[] {
	const sourceDelta = getSourceDeltaForClipDelta({
		member,
		clipDelta: deltaTime,
	});

	if (side === "left") {
		const update: GroupResizeUpdate = {
			trackId: member.trackId,
			elementId: member.elementId,
			patch: {
				trimStart: maxMediaTime({
					a: ZERO_MEDIA_TIME,
					b: addMediaTime({ a: member.trimStart, b: sourceDelta }),
				}),
				trimEnd: member.trimEnd,
				startTime: addMediaTime({ a: member.startTime, b: deltaTime }),
				duration: subMediaTime({ a: member.duration, b: deltaTime }),
			},
		};
		const neighborUpdate = buildLeftBoundaryNeighborUpdate({
			member,
			deltaTime,
		});
		return neighborUpdate ? [update, neighborUpdate] : [update];
	}

	const update: GroupResizeUpdate = {
		trackId: member.trackId,
		elementId: member.elementId,
		patch: {
			trimStart: member.trimStart,
			trimEnd: maxMediaTime({
				a: ZERO_MEDIA_TIME,
				b: subMediaTime({ a: member.trimEnd, b: sourceDelta }),
			}),
			startTime: member.startTime,
			duration: addMediaTime({ a: member.duration, b: deltaTime }),
		},
	};
	const neighborUpdate = buildRightBoundaryNeighborUpdate({
		member,
		deltaTime,
	});
	return neighborUpdate ? [update, neighborUpdate] : [update];
}

function buildRightBoundaryNeighborUpdate({
	member,
	deltaTime,
}: {
	member: GroupResizeMember;
	deltaTime: MediaTime;
}): GroupResizeUpdate | null {
	if (deltaTime <= 0 || !canRollRightBoundary({ member })) return null;
	const neighbor = member.rightBoundaryNeighbor;
	if (!neighbor) return null;
	const neighborSourceDelta = getSourceDeltaForClipDelta({
		member: neighbor,
		clipDelta: deltaTime,
	});

	return {
		trackId: neighbor.trackId,
		elementId: neighbor.elementId,
		patch: {
			trimStart: addMediaTime({
				a: neighbor.trimStart,
				b: neighborSourceDelta,
			}),
			trimEnd: neighbor.trimEnd,
			startTime: addMediaTime({ a: neighbor.startTime, b: deltaTime }),
			duration: subMediaTime({ a: neighbor.duration, b: deltaTime }),
		},
	};
}

function buildLeftBoundaryNeighborUpdate({
	member,
	deltaTime,
}: {
	member: GroupResizeMember;
	deltaTime: MediaTime;
}): GroupResizeUpdate | null {
	if (deltaTime >= 0 || !canRollLeftBoundary({ member })) return null;
	const neighbor = member.leftBoundaryNeighbor;
	if (!neighbor) return null;
	const shrinkDuration = Math.abs(deltaTime);
	const neighborSourceDelta = getSourceDeltaForClipDelta({
		member: neighbor,
		clipDelta: shrinkDuration,
	});

	return {
		trackId: neighbor.trackId,
		elementId: neighbor.elementId,
		patch: {
			trimStart: neighbor.trimStart,
			trimEnd: addMediaTime({
				a: neighbor.trimEnd,
				b: neighborSourceDelta,
			}),
			startTime: neighbor.startTime,
			duration: subMediaTime({ a: neighbor.duration, b: shrinkDuration }),
		},
	};
}

function getMinimumAllowedDeltaTime({
	member,
	side,
	minDuration,
}: {
	member: GroupResizeMember;
	side: ResizeSide;
	minDuration: MediaTime;
}): MediaTime {
	if (side === "right") {
		return subMediaTime({ a: minDuration, b: member.duration });
	}

	const leftNeighborFloor = canRollLeftBoundary({ member })
		? subMediaTime({
				a: ZERO_MEDIA_TIME,
				b: getBoundaryNeighborShrinkCapacity({
					neighbor: member.leftBoundaryNeighbor,
					minDuration,
				}),
			})
		: member.leftNeighborBound !== null
			? subMediaTime({ a: member.leftNeighborBound, b: member.startTime })
			: subMediaTime({ a: ZERO_MEDIA_TIME, b: member.startTime });
	if (member.sourceDuration == null) {
		return leftNeighborFloor;
	}

	const maximumSourceExtension = subMediaTime({
		a: getDurationForVisibleSourceSpan({
			member,
			sourceSpan: addMediaTime({
				a: getVisibleSourceSpanForDuration({
					member,
					duration: member.duration,
				}),
				b: member.trimStart,
			}),
		}),
		b: member.duration,
	});
	return maxMediaTime({
		a: leftNeighborFloor,
		b: subMediaTime({ a: ZERO_MEDIA_TIME, b: maximumSourceExtension }),
	});
}

function getMaximumAllowedDeltaTime({
	member,
	side,
	minDuration,
}: {
	member: GroupResizeMember;
	side: ResizeSide;
	minDuration: MediaTime;
}): MediaTime | null {
	if (side === "left") {
		return subMediaTime({ a: member.duration, b: minDuration });
	}

	const rightNeighborCeiling = canRollRightBoundary({ member })
		? getBoundaryNeighborShrinkCapacity({
				neighbor: member.rightBoundaryNeighbor,
				minDuration,
			})
		: member.rightNeighborBound === null
			? null
			: subMediaTime({
					a: member.rightNeighborBound,
					b: addMediaTime({ a: member.startTime, b: member.duration }),
				});
	if (member.sourceDuration == null) {
		return rightNeighborCeiling;
	}

	const maximumVisibleSourceSpan = subMediaTime({
		a: getSourceDuration({ member }),
		b: member.trimStart,
	});
	const maximumDuration = getDurationForVisibleSourceSpan({
		member,
		sourceSpan: maximumVisibleSourceSpan,
	});
	const sourceDurationCeiling = subMediaTime({
		a: maximumDuration,
		b: member.duration,
	});
	return rightNeighborCeiling === null
		? sourceDurationCeiling
		: minMediaTime({ a: rightNeighborCeiling, b: sourceDurationCeiling });
}

function getBoundaryNeighborShrinkCapacity({
	neighbor,
	minDuration,
}: {
	neighbor?: BoundaryResizeNeighbor;
	minDuration: MediaTime;
}): MediaTime {
	if (!neighbor) return ZERO_MEDIA_TIME;
	return maxMediaTime({
		a: ZERO_MEDIA_TIME,
		b: subMediaTime({ a: neighbor.duration, b: minDuration }),
	});
}

function canRollRightBoundary({
	member,
}: {
	member: GroupResizeMember;
}): boolean {
	const neighbor = member.rightBoundaryNeighbor;
	if (!neighbor) return false;
	if (!hasSharedSource({ member, neighbor })) return false;
	const memberEnd = addMediaTime({ a: member.startTime, b: member.duration });
	if (memberEnd !== neighbor.startTime) return false;
	return getSourceEnd({ member }) === neighbor.trimStart;
}

function canRollLeftBoundary({
	member,
}: {
	member: GroupResizeMember;
}): boolean {
	const neighbor = member.leftBoundaryNeighbor;
	if (!neighbor) return false;
	if (!hasSharedSource({ member, neighbor })) return false;
	const neighborEnd = addMediaTime({
		a: neighbor.startTime,
		b: neighbor.duration,
	});
	if (neighborEnd !== member.startTime) return false;
	return getSourceEnd({ member: neighbor }) === member.trimStart;
}

function hasSharedSource({
	member,
	neighbor,
}: {
	member: GroupResizeMember;
	neighbor: BoundaryResizeNeighbor;
}): boolean {
	return (
		member.sourceKey !== undefined &&
		neighbor.sourceKey !== undefined &&
		member.sourceKey === neighbor.sourceKey
	);
}

function getSourceEnd({
	member,
}: {
	member: Pick<
		GroupResizeMember,
		"duration" | "retime" | "trimStart" | "sourceDuration"
	>;
}): MediaTime {
	return minMediaTime({
		a: getSourceDuration({ member }),
		b: addMediaTime({
			a: member.trimStart,
			b: getVisibleSourceSpanForDuration({
				member,
				duration: member.duration,
			}),
		}),
	});
}

function getSourceDeltaForClipDelta({
	member,
	clipDelta,
}: {
	member: Pick<GroupResizeMember, "retime">;
	clipDelta: MediaTime;
}): MediaTime {
	if (!member.retime) {
		return clipDelta;
	}

	const sourceDelta =
		clipDelta >= 0
			? getSourceSpanAtClipTime({
					clipTime: clipDelta,
					retime: member.retime,
				})
			: -getSourceSpanAtClipTime({
					clipTime: Math.abs(clipDelta),
					retime: member.retime,
				});
	return roundMediaTime({ time: sourceDelta });
}

function getVisibleSourceSpanForDuration({
	member,
	duration,
}: {
	member: Pick<GroupResizeMember, "retime">;
	duration: MediaTime;
}): MediaTime {
	if (!member.retime) {
		return duration;
	}

	return roundMediaTime({
		time: getSourceSpanAtClipTime({
			clipTime: duration,
			retime: member.retime,
		}),
	});
}

function getDurationForVisibleSourceSpan({
	member,
	sourceSpan,
}: {
	member: Pick<GroupResizeMember, "retime">;
	sourceSpan: MediaTime;
}): MediaTime {
	if (!member.retime) {
		return sourceSpan;
	}

	return roundMediaTime({
		time: getTimelineDurationForSourceSpan({
			sourceSpan,
			retime: member.retime,
		}),
	});
}

function getSourceDuration({
	member,
}: {
	member: Pick<
		GroupResizeMember,
		"duration" | "retime" | "sourceDuration" | "trimEnd" | "trimStart"
	>;
}): MediaTime {
	if (member.sourceDuration != null) {
		return member.sourceDuration;
	}

	return addMediaTime({
		a: addMediaTime({
			a: member.trimStart,
			b: getVisibleSourceSpanForDuration({
			member,
			duration: member.duration,
			}),
		}),
		b: member.trimEnd,
	});
}
