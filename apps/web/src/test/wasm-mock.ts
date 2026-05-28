import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

const TICKS_PER_SECOND = MEDIA_TIME_TICKS_PER_SECOND;
const ZERO_MEDIA_TIME = 0;

function roundMediaTime({ time }: { time: number }) {
	const roundedMagnitude = Math.round(Math.abs(time));
	if (roundedMagnitude === 0) return ZERO_MEDIA_TIME;
	return time < 0 ? -roundedMagnitude : roundedMagnitude;
}

function mediaTime({ ticks }: { ticks: number }) {
	return roundMediaTime({ time: ticks });
}

function mediaTimeFromSeconds({ seconds }: { seconds: number }) {
	return roundMediaTime({ time: seconds * TICKS_PER_SECOND });
}

function mediaTimeToSeconds({ time }: { time: number }) {
	return time / TICKS_PER_SECOND;
}

function addMediaTime({ a, b }: { a: number; b: number }) {
	return mediaTime({ ticks: a + b });
}

function subMediaTime({ a, b }: { a: number; b: number }) {
	return mediaTime({ ticks: a - b });
}

function maxMediaTime({ a, b }: { a: number; b: number }) {
	return a > b ? a : b;
}

function minMediaTime({ a, b }: { a: number; b: number }) {
	return a < b ? a : b;
}

function clampMediaTime({
	time,
	min,
	max,
}: {
	time: number;
	min: number;
	max: number;
}) {
	if (time < min) return min;
	if (time > max) return max;
	return time;
}

function lastFrameMediaTime({ duration }: { duration: number }) {
	return Math.max(ZERO_MEDIA_TIME, duration - 1);
}

function identityTime({ time }: { time: number }) {
	return roundMediaTime({ time });
}

function identityTicks({ ticks }: { ticks: number }) {
	return roundMediaTime({ time: ticks });
}

type FrameRateLike = {
	numerator: number;
	denominator: number;
};

function frameRateToFloat({ rate }: { rate?: FrameRateLike } = {}) {
	return rate ? rate.numerator / rate.denominator : 30;
}

function mediaTimeFromFrame({
	frame,
	rate,
}: {
	frame: number;
	rate?: FrameRateLike;
}) {
	return roundMediaTime({
		time: (frame / frameRateToFloat({ rate })) * TICKS_PER_SECOND,
	});
}

function mediaTimeToFrame({
	time,
	rate,
}: {
	time: number;
	rate?: FrameRateLike;
}) {
	return Math.round(mediaTimeToSeconds({ time }) * frameRateToFloat({ rate }));
}

function formatTimecode({ time }: { time: number }) {
	const totalSeconds = Math.max(0, Math.floor(mediaTimeToSeconds({ time })));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return [hours, minutes, seconds]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

export const wasmMock = {
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
	mediaTime,
	roundMediaTime,
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	addMediaTime,
	subMediaTime,
	maxMediaTime,
	minMediaTime,
	clampMediaTime,
	lastFrameMediaTime,
	roundFrameTime: identityTime,
	roundFrameTicks: identityTicks,
	roundToFrame: identityTime,
	snapSeekMediaTime: identityTime,
	snappedSeekTime: identityTime,
	parseTimecode: () => ZERO_MEDIA_TIME,
	parseMediaTimecode: () => ZERO_MEDIA_TIME,
	formatTimecode,
	frameRateToFloat,
	getCompositorCanvas: () => ({}),
	getLastFrameProfile: () => null,
	initCompositor: () => {},
	releaseTexture: () => {},
	renderFrame: () => {},
	resizeCompositor: () => {},
	uploadTexture: () => {},
	applyEffectPasses: () => ({}),
	applyMaskFeather: () => ({}),
	initializeGpu: async () => {},
	detectSilenceSegments: () => [],
};

export const opencutWasmMock = {
	TICKS_PER_SECOND: () => TICKS_PER_SECOND,
	applyEffectPasses: ({ source }: { source: OffscreenCanvas }) => source,
	applyMaskFeather: ({ mask }: { mask: OffscreenCanvas }) => mask,
	floorToFrame: identityTime,
	formatTimecode,
	getCompositorCanvas: wasmMock.getCompositorCanvas,
	getLastFrameProfile: wasmMock.getLastFrameProfile,
	guessTimecodeFormat: () => "MM:SS",
	initCompositor: wasmMock.initCompositor,
	initializeGpu: wasmMock.initializeGpu,
	isFrameAligned: () => true,
	lastFrameTime: lastFrameMediaTime,
	mediaTimeAdd: ({
		lhs,
		rhs,
	}: {
		lhs: number;
		rhs: number;
	}) => addMediaTime({ a: lhs, b: rhs }),
	mediaTimeClamp: clampMediaTime,
	mediaTimeFromFrame,
	mediaTimeFromSeconds,
	mediaTimeMax: ({
		lhs,
		rhs,
	}: {
		lhs: number;
		rhs: number;
	}) => maxMediaTime({ a: lhs, b: rhs }),
	mediaTimeMin: ({
		lhs,
		rhs,
	}: {
		lhs: number;
		rhs: number;
	}) => minMediaTime({ a: lhs, b: rhs }),
	mediaTimeSub: ({
		lhs,
		rhs,
	}: {
		lhs: number;
		rhs: number;
	}) => subMediaTime({ a: lhs, b: rhs }),
	mediaTimeToFrame,
	mediaTimeToSeconds,
	parseTimecode: () => ZERO_MEDIA_TIME,
	releaseTexture: wasmMock.releaseTexture,
	renderFrame: wasmMock.renderFrame,
	resizeCompositor: wasmMock.resizeCompositor,
	roundToFrame: identityTime,
	snappedSeekTime: identityTime,
	uploadTexture: wasmMock.uploadTexture,
};
