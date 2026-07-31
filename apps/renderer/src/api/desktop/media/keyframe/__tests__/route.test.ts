import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-keyframe-route-"));
	process.env = {
		...originalEnv,
		SHOTLYX_DESKTOP: "1",
		SHOTLYX_DESKTOP_MEDIA_ANALYZE_DIR: tempDir,
	};
});

afterEach(() => {
	process.env = { ...originalEnv };
	rmSync(tempDir, { recursive: true, force: true });
});

test("desktop media keyframe route returns an extracted frame as data URL", async () => {
	const imagePath = path.join(tempDir, "asset-1", "keyframes", "frame.jpg");
	mkdirSync(path.dirname(imagePath), { recursive: true });
	writeFileSync(imagePath, Buffer.from([0xff, 0xd8, 0xff]), {
		flag: "w",
	});

	const { GET } = await import("../route");
	const response = await GET(
		new Request(
			`http://localhost/api/desktop/media/keyframe?payload=${encodeURIComponent(
				JSON.stringify({
					imagePath,
					name: "frame.jpg",
				}),
			)}`,
		),
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		dataUrl: "data:image/jpeg;base64,/9j/",
		mimeType: "image/jpeg",
		name: "frame.jpg",
	});
});

test("desktop media keyframe route rejects paths outside analysis temp dir", async () => {
	const { GET } = await import("../route");
	await expect(
		GET(
			new Request(
				`http://localhost/api/desktop/media/keyframe?payload=${encodeURIComponent(
					JSON.stringify({
						imagePath: "/etc/passwd",
					}),
				)}`,
			),
		),
	).rejects.toThrow("media_analysis_forbidden_image_path");
});
