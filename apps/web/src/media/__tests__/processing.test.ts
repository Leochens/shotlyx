import { afterEach, beforeEach, expect, mock, test } from "bun:test";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

const readVideoFileMock = mock(async ({ file }: { file: File }) => {
	if (file.name.endsWith(".mov")) {
		return {
			duration: 2,
			width: 640,
			height: 480,
			fps: 30,
			hasAudio: true,
			codec: "hevc",
			canDecode: false,
			thumbnailUrl: null,
		};
	}
	return {
		duration: 2,
		width: 640,
		height: 480,
		fps: 30,
		hasAudio: true,
		codec: "avc",
		canDecode: true,
		thumbnailUrl: "data:image/png;base64,thumb",
	};
});

const toastErrorMock = mock(() => {});

mock.module("sonner", () => ({
	toast: { error: toastErrorMock },
}));

mock.module("@/services/storage/service", () => ({
	storageService: {
		canStoreFile: async () => ({
			availableBytes: 1024 * 1024,
			canStore: true,
		}),
	},
}));

mock.module("../mediabunny", () => ({
	readVideoFile: readVideoFileMock,
}));

const { processMediaAssets } = await import("../processing");

beforeEach(() => {
	process.env = {
		...originalEnv,
		VITE_SHOTLYX_DESKTOP: "1",
	};
	readVideoFileMock.mockClear();
	toastErrorMock.mockClear();
	URL.createObjectURL = mock(
		() => "blob:shotlyx-test",
	) as typeof URL.createObjectURL;
	URL.revokeObjectURL = mock(() => {}) as typeof URL.revokeObjectURL;
	globalThis.fetch = mock(async () => {
		const prepared = new Blob(["webm bytes"], { type: "video/webm" });
		return new Response(prepared, {
			headers: {
				"Content-Type": "video/webm",
				"X-Shotlyx-Filename": encodeURIComponent("pink-alpha.webm"),
			},
		});
	}) as typeof fetch;
});

afterEach(() => {
	process.env = { ...originalEnv };
	globalThis.fetch = originalFetch;
	URL.createObjectURL = originalCreateObjectUrl;
	URL.revokeObjectURL = originalRevokeObjectUrl;
	mock.restore();
});

test("desktop import prepares unsupported videos before creating the asset", async () => {
	const source = new File(["mov bytes"], "pink-alpha.mov", {
		type: "video/quicktime",
	});

	const assets = await processMediaAssets({ files: [source] });

	expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	expect(readVideoFileMock).toHaveBeenCalledTimes(2);
	expect(assets).toHaveLength(1);
	expect(assets[0]).toMatchObject({
		name: "pink-alpha.webm",
		type: "video",
		duration: 2,
		width: 640,
		height: 480,
		fps: 30,
		hasAudio: true,
		thumbnailUrl: "data:image/png;base64,thumb",
	});
	expect(assets[0]?.file.name).toBe("pink-alpha.webm");
	expect(assets[0]?.file.type).toBe("video/webm");
	expect(toastErrorMock).not.toHaveBeenCalled();
});
