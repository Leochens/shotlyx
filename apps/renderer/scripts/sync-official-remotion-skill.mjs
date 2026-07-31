#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICIAL_SOURCE = {
	repository: "https://github.com/remotion-dev/skills",
	commit: "277510e78245ac0fa275d7cb6520d52e0ac2e212",
	skillRoot: "skills/remotion",
};

const FILES = [
	"skills/remotion/SKILL.md",
	"skills/remotion/rules/3d.md",
	"skills/remotion/rules/audio-visualization.md",
	"skills/remotion/rules/audio.md",
	"skills/remotion/rules/calculate-metadata.md",
	"skills/remotion/rules/compositions.md",
	"skills/remotion/rules/display-captions.md",
	"skills/remotion/rules/ffmpeg.md",
	"skills/remotion/rules/get-audio-duration.md",
	"skills/remotion/rules/get-video-dimensions.md",
	"skills/remotion/rules/get-video-duration.md",
	"skills/remotion/rules/gifs.md",
	"skills/remotion/rules/google-fonts.md",
	"skills/remotion/rules/html-in-canvas.md",
	"skills/remotion/rules/images.md",
	"skills/remotion/rules/import-srt-captions.md",
	"skills/remotion/rules/light-leaks.md",
	"skills/remotion/rules/local-fonts.md",
	"skills/remotion/rules/lottie.md",
	"skills/remotion/rules/maplibre.md",
	"skills/remotion/rules/measuring-dom-nodes.md",
	"skills/remotion/rules/measuring-text.md",
	"skills/remotion/rules/parameters.md",
	"skills/remotion/rules/sequencing.md",
	"skills/remotion/rules/sfx.md",
	"skills/remotion/rules/silence-detection.md",
	"skills/remotion/rules/subtitles.md",
	"skills/remotion/rules/tailwind.md",
	"skills/remotion/rules/text-animations.md",
	"skills/remotion/rules/timing.md",
	"skills/remotion/rules/transcribe-captions.md",
	"skills/remotion/rules/transitions.md",
	"skills/remotion/rules/transparent-videos.md",
	"skills/remotion/rules/trimming.md",
	"skills/remotion/rules/videos.md",
	"skills/remotion/rules/voiceover.md",
	"skills/remotion/rules/assets/charts-bar-chart.tsx",
	"skills/remotion/rules/assets/text-animations-typewriter.tsx",
	"skills/remotion/rules/assets/text-animations-word-highlight.tsx",
];

function parseOutputArg() {
	const outputIndex = process.argv.indexOf("--output");
	if (outputIndex >= 0) {
		const output = process.argv[outputIndex + 1];
		if (!output) {
			throw new Error("--output requires a path");
		}
		return resolve(process.cwd(), output);
	}
	const scriptDir = dirname(fileURLToPath(import.meta.url));
	return resolve(scriptDir, "../agent-dev/remotion-skill-official");
}

function rawUrl(file) {
	return `https://raw.githubusercontent.com/remotion-dev/skills/${OFFICIAL_SOURCE.commit}/${file}`;
}

async function fetchText(file) {
	const response = await fetch(rawUrl(file));
	if (!response.ok) {
		throw new Error(`Failed to fetch ${file}: ${response.status}`);
	}
	return await response.text();
}

async function main() {
	const outputDir = parseOutputArg();
	await mkdir(outputDir, { recursive: true });
	const written = [];

	for (const file of FILES) {
		const text = await fetchText(file);
		const relative = file.replace(`${OFFICIAL_SOURCE.skillRoot}/`, "");
		const target = resolve(outputDir, relative);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, text);
		written.push(relative);
	}

	await writeFile(
		resolve(outputDir, "UPSTREAM.json"),
		`${JSON.stringify(
			{
				...OFFICIAL_SOURCE,
				syncedAt: new Date().toISOString(),
				files: written,
			},
			null,
			2,
		)}\n`,
	);

	console.log(`Synced official Remotion skill to ${outputDir}`);
	console.log(
		`Source: ${OFFICIAL_SOURCE.repository} @ ${OFFICIAL_SOURCE.commit}`,
	);
	console.log(`Files: ${written.length}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
