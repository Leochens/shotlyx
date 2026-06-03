import { describe, expect, test } from "bun:test";
import { createAudioPreviewPlayer } from "../audio-preview-player";

function createFakeAudio(url: string) {
	return {
		url,
		paused: true,
		currentTime: 4,
		playCalls: 0,
		pauseCalls: 0,
		play() {
			this.paused = false;
			this.playCalls += 1;
			return Promise.resolve();
		},
		pause() {
			this.paused = true;
			this.pauseCalls += 1;
		},
	};
}

describe("createAudioPreviewPlayer", () => {
	test("toggles the same audio url instead of stacking duplicate playback", async () => {
		const created: ReturnType<typeof createFakeAudio>[] = [];
		const playingChanges: Array<string | null> = [];
		const player = createAudioPreviewPlayer({
			createAudio: (url) => {
				const audio = createFakeAudio(url);
				created.push(audio);
				return audio;
			},
			onPlayingChange: (url) => playingChanges.push(url),
		});

		await player.toggle("blob:sample");
		await player.toggle("blob:sample");

		expect(created).toHaveLength(1);
		expect(created[0]?.playCalls).toBe(1);
		expect(created[0]?.pauseCalls).toBe(1);
		expect(created[0]?.currentTime).toBe(0);
		expect(player.isPlaying("blob:sample")).toBe(false);
		expect(playingChanges).toEqual(["blob:sample", null]);
	});
});
