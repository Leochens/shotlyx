#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_VIDEO_PATH = "/Users/leochens/Downloads/patagonmarkets录屏.mp4";
const TOKEN_PLAN_HOST = "https://api.minimaxi.com/v1";
const LEGACY_GLOBAL_HOST = "https://api.minimax.io/v1";

function parseArgs(argv) {
	const options = {
		video: DEFAULT_VIDEO_PATH,
		host: undefined,
		model: undefined,
		stream: false,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--video") options.video = argv[++index];
		else if (arg === "--host") options.host = argv[++index];
		else if (arg === "--model") options.model = argv[++index];
		else if (arg === "--stream") options.stream = true;
		else if (arg === "--help" || arg === "-h") {
			printHelp();
			process.exit(0);
		}
	}
	return options;
}

function printHelp() {
	console.log(`Usage:
  node scripts/diagnose-minimax-m3-vision.mjs --video /path/to/video.mp4

Options:
  --video   Local video file to send. Defaults to ${DEFAULT_VIDEO_PATH}
  --host    Override MiniMax OpenAI-compatible base URL.
  --model   Override model ID. Defaults to AGENT_VISION_MODEL or MiniMax-M3.
  --stream  Test streaming instead of non-streaming.

The script reads AGENT_VISION_* from the environment first, then from
~/.shotlyx/desktop-api-config.json. It never prints the API key.`);
}

function readDesktopConfig() {
	const configPath =
		process.env.SHOTLYX_DESKTOP_CONFIG_PATH ??
		path.join(homedir(), ".shotlyx", "desktop-api-config.json");
	if (!existsSync(configPath)) return {};
	try {
		const config = JSON.parse(readFileSync(configPath, "utf8"));
		return config?.values && typeof config.values === "object"
			? config.values
			: {};
	} catch {
		return {};
	}
}

function resolveConfig(options) {
	const desktopValues = readDesktopConfig();
	const apiKey =
		process.env.AGENT_VISION_KEY || desktopValues.AGENT_VISION_KEY || "";
	const configuredHost =
		options.host ||
		process.env.AGENT_VISION_HOST ||
		desktopValues.AGENT_VISION_HOST ||
		TOKEN_PLAN_HOST;
	const rawHost = configuredHost.replace(/\/+$/, "");
	const host =
		apiKey.startsWith("sk-cp-") && rawHost === LEGACY_GLOBAL_HOST
			? TOKEN_PLAN_HOST
			: rawHost;
	const model =
		options.model ||
		process.env.AGENT_VISION_MODEL ||
		desktopValues.AGENT_VISION_MODEL ||
		"MiniMax-M3";
	return {
		apiKey,
		rawHost,
		host,
		model,
	};
}

function maskKey(value) {
	if (!value) return "unset";
	return `set length=${value.length} prefix=${value.slice(0, 5)}... suffix=...${value.slice(-4)}`;
}

function extensionForName(name) {
	const match = /\.([^.]+)$/.exec(name.trim().toLowerCase());
	return match?.[1] ?? "";
}

function mimeTypeForPath(filePath) {
	switch (extensionForName(filePath)) {
		case "mp4":
		case "m4v":
			return "video/mp4";
		case "mov":
			return "video/quicktime";
		case "avi":
			return "video/x-msvideo";
		case "mkv":
			return "video/x-matroska";
		case "webm":
			return "video/webm";
		default:
			return "video/mp4";
	}
}

function uniqueHosts(configuredHost) {
	const candidates = [
		configuredHost,
		LEGACY_GLOBAL_HOST,
		TOKEN_PLAN_HOST,
	];
	const seen = new Set();
	return candidates.filter((host) => {
		const normalized = host.replace(/\/+$/, "");
		if (seen.has(normalized)) return false;
		seen.add(normalized);
		return true;
	});
}

function buildRequestBody({
	videoPath,
	mimeType,
	model,
	stream,
}) {
	const bytes = readFileSync(videoPath);
	const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
	return {
		model,
		thinking: { type: "disabled" },
		reasoning_split: true,
		max_completion_tokens: 512,
		temperature: 0.2,
		...(stream
			? {
					stream: true,
					stream_options: { include_usage: true },
				}
			: {}),
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "请用中文简要描述这个视频画面内容，并给出3条剪辑建议。",
					},
					{
						type: "video_url",
						video_url: {
							url: dataUrl,
							detail: "default",
							fps: 0.2,
							max_long_side_pixel: 672,
						},
					},
				],
			},
		],
	};
}

function extractContent(data) {
	const content = data?.choices?.[0]?.message?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === "string") return part;
				if (part && typeof part === "object" && typeof part.text === "string") {
					return part.text;
				}
				return "";
			})
			.join("");
	}
	return "";
}

async function readStream(response) {
	const reader = response.body?.getReader();
	if (!reader) return "";
	const decoder = new TextDecoder();
	let text = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		text += decoder.decode(value, { stream: true });
	}
	return text;
}

async function tryHost({ host, apiKey, body, stream }) {
	const url = `${host.replace(/\/+$/, "")}/chat/completions`;
	const started = Date.now();
	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	const elapsedMs = Date.now() - started;
	const contentType = response.headers.get("content-type") ?? "";
	if (!response.ok) {
		const errorText = await response.text();
		return {
			ok: false,
			status: response.status,
			elapsedMs,
			contentType,
			errorText: errorText.slice(0, 1200),
		};
	}
	if (stream) {
		return {
			ok: true,
			status: response.status,
			elapsedMs,
			contentType,
			streamText: await readStream(response),
		};
	}
	const data = await response.json();
	return {
		ok: true,
		status: response.status,
		elapsedMs,
		contentType,
		content: extractContent(data),
		usage: data?.usage,
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const config = resolveConfig(options);
	if (!config.apiKey) {
		throw new Error("Missing AGENT_VISION_KEY or desktop AGENT_VISION_KEY");
	}
	if (!existsSync(options.video)) {
		throw new Error(`Video file not found: ${options.video}`);
	}

	const fileSize = statSync(options.video).size;
	const mimeType = mimeTypeForPath(options.video);
	const body = buildRequestBody({
		videoPath: options.video,
		mimeType,
		model: config.model,
		stream: options.stream,
	});
	const bodyBytes = Buffer.byteLength(JSON.stringify(body));

	console.log("[config]");
	console.log(`key: ${maskKey(config.apiKey)}`);
	console.log(`configuredHost: ${config.rawHost}`);
	if (config.host !== config.rawHost) {
		console.log(`effectiveHost: ${config.host}`);
	}
	console.log(`model: ${config.model}`);
	console.log(`video: ${options.video}`);
	console.log(`videoBytes: ${fileSize}`);
	console.log(`mimeType: ${mimeType}`);
	console.log(`requestBodyBytes: ${bodyBytes}`);
	console.log("");

	for (const host of uniqueHosts(config.host)) {
		console.log(`[try] ${host}`);
		const result = await tryHost({
			host,
			apiKey: config.apiKey,
			body,
			stream: options.stream,
		});
		console.log(
			JSON.stringify(
				{
					...result,
					content: result.content ? result.content.slice(0, 1000) : undefined,
					streamText: result.streamText
						? result.streamText.slice(0, 1200)
						: undefined,
				},
				null,
				2,
			),
		);
		if (result.ok) {
			console.log(`[success] ${host}`);
			return;
		}
		console.log("");
	}
	process.exitCode = 1;
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
