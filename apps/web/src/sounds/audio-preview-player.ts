type AudioPreviewElement = {
	currentTime: number;
	play(): Promise<unknown>;
	pause(): void;
	addEventListener?(
		type: "ended",
		listener: () => void,
		options?: AddEventListenerOptions,
	): void;
	removeEventListener?(type: "ended", listener: () => void): void;
};

type AudioPreviewPlayerOptions = {
	createAudio?: (url: string) => AudioPreviewElement;
	onPlayingChange?: (url: string | null) => void;
};

export function createAudioPreviewPlayer({
	createAudio = (url) => new Audio(url),
	onPlayingChange,
}: AudioPreviewPlayerOptions = {}) {
	let currentAudio: AudioPreviewElement | null = null;
	let currentUrl: string | null = null;
	let removeEndedListener: (() => void) | null = null;

	const clearCurrent = ({ resetTime }: { resetTime: boolean }) => {
		const audio = currentAudio;
		removeEndedListener?.();
		removeEndedListener = null;
		currentAudio = null;
		currentUrl = null;
		if (audio && resetTime) {
			audio.currentTime = 0;
		}
		onPlayingChange?.(null);
	};

	const stop = () => {
		const audio = currentAudio;
		if (!audio) return;
		audio.pause();
		clearCurrent({ resetTime: true });
	};

	const toggle = async (url: string) => {
		if (currentAudio && currentUrl === url) {
			stop();
			return "stopped" as const;
		}

		stop();
		const audio = createAudio(url);
		const endedListener = () => {
			if (currentAudio !== audio) return;
			clearCurrent({ resetTime: true });
		};
		audio.addEventListener?.("ended", endedListener, { once: true });
		removeEndedListener = () => {
			audio.removeEventListener?.("ended", endedListener);
		};
		currentAudio = audio;
		currentUrl = url;

		try {
			await audio.play();
		} catch (error) {
			if (currentAudio === audio) {
				stop();
			}
			throw error;
		}

		if (currentAudio !== audio || currentUrl !== url) {
			return "stopped" as const;
		}
		onPlayingChange?.(url);
		return "playing" as const;
	};

	return {
		toggle,
		stop,
		isPlaying(url?: string) {
			if (!currentAudio) return false;
			return url ? currentUrl === url : true;
		},
	};
}
