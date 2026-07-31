import type { BuiltInSoundEffectDefinition } from "@/sounds/builtin-library";

const SAMPLE_RATE = 44_100;
const TWO_PI = Math.PI * 2;

function clampSample(value: number) {
	return Math.max(-1, Math.min(1, value));
}

function envelope({
	progress,
	attack = 0.05,
	release = 0.25,
}: {
	progress: number;
	attack?: number;
	release?: number;
}) {
	if (progress < attack) return progress / attack;
	if (progress > 1 - release) return Math.max(0, (1 - progress) / release);
	return 1;
}

function sine({ frequency, time }: { frequency: number; time: number }) {
	return Math.sin(TWO_PI * frequency * time);
}

function noise({ index, seed }: { index: number; seed: number }) {
	const value = Math.sin((index + 1) * (seed * 12.9898 + 78.233)) * 43_758.5453;
	return (value - Math.floor(value)) * 2 - 1;
}

function renderSample({
	definition,
	index,
}: {
	definition: BuiltInSoundEffectDefinition;
	index: number;
}) {
	const { kind, seed } = definition.synthesis;
	const time = index / SAMPLE_RATE;
	const progress = time / definition.duration;
	const n = noise({ index, seed });

	switch (kind) {
		case "whoosh": {
			const sweep = sine({ frequency: 180 + 620 * progress, time });
			const air = n * (0.35 + progress * 0.25);
			return (air + sweep * 0.18) * envelope({ progress, attack: 0.08 });
		}
		case "pop": {
			const body = sine({ frequency: 180 - 70 * progress, time });
			const transient = progress < 0.08 ? n * (1 - progress / 0.08) : 0;
			return (body * 0.7 + transient * 0.3) * Math.exp(-progress * 7);
		}
		case "click": {
			const tone = sine({ frequency: 1_650, time });
			return (tone * 0.4 + n * 0.6) * Math.exp(-progress * 18);
		}
		case "chime": {
			const root = sine({ frequency: 880, time });
			const fifth = sine({ frequency: 1_320, time });
			const octave = sine({ frequency: 1_760, time });
			return (
				(root * 0.45 + fifth * 0.28 + octave * 0.18) * Math.exp(-progress * 4)
			);
		}
		case "riser": {
			const sweep = sine({ frequency: 220 + 980 * progress * progress, time });
			const shimmer = sine({ frequency: 660 + 1_200 * progress, time }) * 0.18;
			return (
				(sweep * 0.42 + shimmer + n * 0.12) *
				envelope({ progress, attack: 0.1, release: 0.08 })
			);
		}
		case "impact": {
			const thump = sine({ frequency: 92 - 38 * progress, time });
			return (thump * 0.8 + n * 0.24) * Math.exp(-progress * 6);
		}
		case "tick": {
			const tone = sine({ frequency: 1_250, time });
			const upper = sine({ frequency: 2_500, time }) * 0.24;
			return (tone * 0.5 + upper + n * 0.25) * Math.exp(-progress * 16);
		}
		case "camera": {
			const first = progress < 0.16 ? n * Math.exp(-progress * 35) : 0;
			const secondProgress = Math.max(0, progress - 0.28);
			const second =
				progress > 0.28 ? n * 0.8 * Math.exp(-secondProgress * 28) : 0;
			return first + second;
		}
		default:
			return 0;
	}
}

function writeAscii({
	view,
	offset,
	value,
}: {
	view: DataView;
	offset: number;
	value: string;
}) {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}

export function renderBuiltInSoundWav({
	definition,
}: {
	definition: BuiltInSoundEffectDefinition;
}): Uint8Array {
	const sampleCount = Math.max(1, Math.ceil(definition.duration * SAMPLE_RATE));
	const dataSize = sampleCount * 2;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeAscii({ view, offset: 0, value: "RIFF" });
	view.setUint32(4, 36 + dataSize, true);
	writeAscii({ view, offset: 8, value: "WAVE" });
	writeAscii({ view, offset: 12, value: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, SAMPLE_RATE, true);
	view.setUint32(28, SAMPLE_RATE * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeAscii({ view, offset: 36, value: "data" });
	view.setUint32(40, dataSize, true);

	for (let index = 0; index < sampleCount; index += 1) {
		const sample = clampSample(renderSample({ definition, index }) * 0.75);
		view.setInt16(44 + index * 2, Math.round(sample * 32_767), true);
	}

	return new Uint8Array(buffer);
}
