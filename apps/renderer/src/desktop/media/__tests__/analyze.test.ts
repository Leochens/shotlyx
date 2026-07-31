import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeVideoAsset } from "../analyze";

let tempDir = "";

afterEach(() => {
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = "";
	}
});

function makeTempDir(): string {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-analyze-test-"));
	return tempDir;
}

function writeExecutableScript({
	body,
	name,
	root,
}: {
	body: string;
	name: string;
	root: string;
}): string {
	const filePath = path.join(root, name);
	writeFileSync(filePath, body);
	chmodSync(filePath, 0o755);
	return filePath;
}

test("falls back to a single-shot inspection when ffmpeg scene/keyframe extraction fails", async () => {
	const root = makeTempDir();
	const videoPath = path.join(root, "demo.mp4");
	writeFileSync(videoPath, "not a real video but ffprobe is mocked by script");
	const ffprobePath = writeExecutableScript({
		root,
		name: "ffprobe",
		body: `#!/bin/sh
cat <<'JSON'
{
  "format": { "duration": "4" },
  "streams": [
    {
      "codec_type": "video",
      "width": 1280,
      "height": 720,
      "avg_frame_rate": "30/1"
    }
  ]
}
JSON
`,
	});
	const ffmpegPath = writeExecutableScript({
		root,
		name: "ffmpeg",
		body: `#!/bin/sh
echo "simulated ffmpeg failure" >&2
exit 1
`,
	});

	const inspection = await analyzeVideoAsset({
		analysisLevel: "standard",
		ffmpegPaths: {
			bundleKey: "test-x64",
			ffmpegPath,
			ffprobePath,
		},
		filePath: videoPath,
		videoId: "fallback-video",
	});

	expect(inspection.profile).toMatchObject({
		videoId: "fallback-video",
		duration: 4,
		width: 1280,
		height: 720,
		sceneChangeDensity: 0,
	});
	expect(inspection.shots).toEqual([
		{
			confidence: 0.65,
			duration: 4,
			end: 4,
			id: "shot_001",
			method: "ffmpeg_scene",
			start: 0,
		},
	]);
	expect(inspection.keyframes).toEqual([
		{
			id: "keyframe_001_001",
			shotId: "shot_001",
			time: 0.75,
		},
		{
			id: "keyframe_001_002",
			shotId: "shot_001",
			time: 2,
		},
		{
			id: "keyframe_001_003",
			shotId: "shot_001",
			time: 3.25,
		},
	]);
});
