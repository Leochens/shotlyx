import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(desktopDir, "../..");
const args = new Set(process.argv.slice(2));

function argValue(name, fallback) {
	const prefix = `--${name}=`;
	const match = [...args].find((arg) => arg.startsWith(prefix));
	return match ? match.slice(prefix.length) : fallback;
}

const platform = argValue("platform", process.platform);
const arch = argValue("arch", process.arch);
const requireProvenance = args.has("--require-provenance");
const bundleKey = `${platform}-${arch}`;
const executableSuffix = platform === "win32" ? ".exe" : "";
const bundleDirectory = path.join(repoRoot, "resources", "ffmpeg", bundleKey);
const binaryPaths = {
	ffmpeg: path.join(bundleDirectory, `ffmpeg${executableSuffix}`),
	ffprobe: path.join(bundleDirectory, `ffprobe${executableSuffix}`),
};

function assertTargetSupported() {
	const supported = new Set(["darwin-arm64", "win32-x64"]);
	if (!supported.has(bundleKey)) {
		throw new Error(
			`Unsupported official FFmpeg bundle target: ${bundleKey}. Supported targets: ${[
				...supported,
			].join(", ")}`,
		);
	}
}

export function detectBinaryArchitecture({ bytes, platform }) {
	if (platform === "darwin") {
		if (bytes.length < 8 || bytes.readUInt32LE(0) !== 0xfeedfacf) {
			throw new Error("not a 64-bit little-endian Mach-O");
		}
		const cpuType = bytes.readUInt32LE(4);
		if (cpuType === 0x0100000c) return "arm64";
		if (cpuType === 0x01000007) return "x64";
		return `mach-o-0x${cpuType.toString(16)}`;
	}

	if (platform === "win32") {
		if (bytes.length < 0x40 || bytes.toString("ascii", 0, 2) !== "MZ") {
			throw new Error("not a Windows PE executable");
		}
		const peOffset = bytes.readUInt32LE(0x3c);
		if (
			peOffset + 6 > bytes.length ||
			bytes.toString("ascii", peOffset, peOffset + 4) !== "PE\u0000\u0000"
		) {
			throw new Error("invalid PE header");
		}
		const machine = bytes.readUInt16LE(peOffset + 4);
		if (machine === 0x8664) return "x64";
		if (machine === 0xaa64) return "arm64";
		return `pe-0x${machine.toString(16)}`;
	}

	throw new Error(`unsupported executable platform: ${platform}`);
}

function assertBinaryArchitecture({ binaryPath }) {
	let detected;
	try {
		detected = detectBinaryArchitecture({
			bytes: readFileSync(binaryPath),
			platform,
		});
	} catch (error) {
		throw new Error(`${binaryPath} is ${error.message}`, { cause: error });
	}
	if (detected !== arch) {
		throw new Error(
			`${binaryPath} has ${detected} architecture; expected ${platform}-${arch}`,
		);
	}
}

function sha256(binaryPath) {
	return createHash("sha256").update(readFileSync(binaryPath)).digest("hex");
}

function readProvenance() {
	const manifestPath =
		process.env.SHOTLYX_FFMPEG_MANIFEST ??
		path.join(repoRoot, "resources", "ffmpeg", "manifest.local.json");
	if (!existsSync(manifestPath)) {
		if (requireProvenance) {
			throw new Error(
				`Missing FFmpeg provenance manifest: ${manifestPath}. See resources/ffmpeg/README.md`,
			);
		}
		return null;
	}
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const bundle = manifest?.bundles?.[bundleKey];
	if (!bundle) {
		throw new Error(`FFmpeg manifest has no ${bundleKey} bundle`);
	}
	for (const field of ["version", "sourceUrl", "license"]) {
		if (typeof bundle[field] !== "string" || bundle[field].trim() === "") {
			throw new Error(`FFmpeg manifest ${bundleKey}.${field} is required`);
		}
	}
	if (!/^https:\/\//.test(bundle.sourceUrl)) {
		throw new Error(`FFmpeg manifest ${bundleKey}.sourceUrl must use HTTPS`);
	}
	return bundle;
}

function verifyChecksums(bundle) {
	if (!bundle) return;
	for (const [name, binaryPath] of Object.entries(binaryPaths)) {
		const expected = bundle.files?.[path.basename(binaryPath)]?.sha256;
		if (typeof expected !== "string" || !/^[a-f0-9]{64}$/i.test(expected)) {
			throw new Error(
				`FFmpeg manifest ${bundleKey}.files.${path.basename(binaryPath)}.sha256 is required`,
			);
		}
		const actual = sha256(binaryPath);
		if (actual.toLowerCase() !== expected.toLowerCase()) {
			throw new Error(
				`${name} checksum mismatch: expected ${expected}, received ${actual}`,
			);
		}
	}
}

function verifyFfmpegBundle() {
	assertTargetSupported();
	for (const binaryPath of Object.values(binaryPaths)) {
		if (!existsSync(binaryPath)) {
			throw new Error(`Missing FFmpeg build input: ${binaryPath}`);
		}
		assertBinaryArchitecture({ binaryPath });
	}
	const provenance = readProvenance();
	verifyChecksums(provenance);
	console.log(
		`Verified FFmpeg bundle ${bundleKey}${provenance ? ` (${provenance.version})` : " architecture"}`,
	);
}

const isDirectExecution =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
	try {
		verifyFfmpegBundle();
	} catch (error) {
		console.error(`FFmpeg verification failed: ${error.message}`);
		process.exitCode = 1;
	}
}
