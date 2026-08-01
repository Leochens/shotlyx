import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectBinaryArchitecture } from "./verify-ffmpeg.mjs";

const desktopDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(desktopDir, "../..");

function readArg(name, fallback) {
	const prefix = `--${name}=`;
	const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
	return match ? match.slice(prefix.length) : fallback;
}

function run(command, args, { env = process.env } = {}) {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		env: { ...env, LC_ALL: "C", LANG: "C" },
		maxBuffer: 10 * 1024 * 1024,
	});
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`,
		);
	}
	return result.stdout;
}

export function parseOtoolDependencies(output) {
	return output
		.split("\n")
		.slice(1)
		.map((line) => line.trim().split(" (compatibility version")[0]?.trim())
		.filter(Boolean);
}

export function isSystemDependency(dependency) {
	return (
		dependency.startsWith("/System/Library/") ||
		dependency.startsWith("/usr/lib/")
	);
}

function readDependencies(filePath) {
	return parseOtoolDependencies(run("otool", ["-L", filePath]));
}

function readRpaths(filePath) {
	const lines = run("otool", ["-l", filePath]).split("\n");
	const result = [];
	for (let index = 0; index < lines.length; index += 1) {
		if (lines[index]?.trim() !== "cmd LC_RPATH") continue;
		for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
			const match = lines[cursor]?.trim().match(/^path (.+) \(offset \d+\)$/);
			if (match) {
				result.push(match[1]);
				break;
			}
		}
	}
	return result;
}

function expandLoaderPath(value, { executableDirectory, loaderDirectory }) {
	if (value.startsWith("@loader_path/")) {
		return path.join(loaderDirectory, value.slice("@loader_path/".length));
	}
	if (value.startsWith("@executable_path/")) {
		return path.join(
			executableDirectory,
			value.slice("@executable_path/".length),
		);
	}
	return value;
}

function resolveDependency({ dependency, executableDirectory, sourcePath }) {
	const loaderDirectory = path.dirname(sourcePath);
	const expanded = expandLoaderPath(dependency, {
		executableDirectory,
		loaderDirectory,
	});
	if (path.isAbsolute(expanded) && existsSync(expanded)) {
		return realpathSync(expanded);
	}
	if (dependency.startsWith("@rpath/")) {
		const relativeDependency = dependency.slice("@rpath/".length);
		for (const rpath of readRpaths(sourcePath)) {
			const expandedRpath = expandLoaderPath(rpath, {
				executableDirectory,
				loaderDirectory,
			});
			const candidate = path.join(expandedRpath, relativeDependency);
			if (existsSync(candidate)) return realpathSync(candidate);
		}
	}
	throw new Error(`Could not resolve ${dependency} required by ${sourcePath}`);
}

function sha256(filePath) {
	return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function assertArm64(filePath) {
	const architecture = detectBinaryArchitecture({
		bytes: readFileSync(filePath),
		platform: "darwin",
	});
	if (architecture !== "arm64") {
		throw new Error(
			`${filePath} has ${architecture} architecture; expected arm64`,
		);
	}
}

function readFormulaMetadata(prefix) {
	const formulaPath = path.join(realpathSync(prefix), ".brew", "ffmpeg.rb");
	if (!existsSync(formulaPath)) {
		throw new Error(
			`Homebrew FFmpeg formula metadata is missing: ${formulaPath}`,
		);
	}
	const formula = readFileSync(formulaPath, "utf8");
	const sourceUrl = formula.match(/^\s*url "([^"]+)"/m)?.[1];
	const license = formula.match(/^\s*license "([^"]+)"/m)?.[1];
	if (!sourceUrl?.startsWith("https://") || !license) {
		throw new Error(
			`Could not read FFmpeg source and license from ${formulaPath}`,
		);
	}
	return { formulaPath, license, sourceUrl };
}

function buildPortableBundle({ outputDirectory, prefix }) {
	const executableDirectory = path.join(realpathSync(prefix), "bin");
	const sourceBinaries = ["ffmpeg", "ffprobe"].map((name) => ({
		name,
		sourcePath: realpathSync(path.join(executableDirectory, name)),
	}));
	for (const binary of sourceBinaries) assertArm64(binary.sourcePath);

	const records = [];
	const recordsBySource = new Map();
	const destinationsByName = new Map();
	const queue = sourceBinaries.map(({ name, sourcePath }) => ({
		destinationPath: path.join(outputDirectory, name),
		kind: "binary",
		sourcePath,
	}));

	while (queue.length > 0) {
		const record = queue.shift();
		const sourceKey = realpathSync(record.sourcePath);
		if (recordsBySource.has(sourceKey)) continue;
		record.dependencies = [];
		records.push(record);
		recordsBySource.set(sourceKey, record);

		for (const dependency of readDependencies(record.sourcePath)) {
			if (isSystemDependency(dependency)) continue;
			const dependencySource = resolveDependency({
				dependency,
				executableDirectory,
				sourcePath: record.sourcePath,
			});
			if (dependencySource === sourceKey) continue;
			const fileName = path.basename(dependencySource);
			const previousSource = destinationsByName.get(fileName);
			if (previousSource && previousSource !== dependencySource) {
				throw new Error(
					`Runtime library name collision for ${fileName}: ${previousSource} and ${dependencySource}`,
				);
			}
			destinationsByName.set(fileName, dependencySource);
			const dependencyDestination = path.join(outputDirectory, "lib", fileName);
			record.dependencies.push({
				destinationPath: dependencyDestination,
				originalReference: dependency,
			});
			queue.push({
				destinationPath: dependencyDestination,
				kind: "library",
				sourcePath: dependencySource,
			});
		}
	}

	rmSync(outputDirectory, { force: true, recursive: true });
	mkdirSync(path.join(outputDirectory, "lib"), { recursive: true });
	for (const record of records) {
		copyFileSync(record.sourcePath, record.destinationPath);
		chmodSync(record.destinationPath, record.kind === "binary" ? 0o755 : 0o644);
	}

	for (const record of records) {
		for (const dependency of record.dependencies) {
			const relative = path
				.relative(
					path.dirname(record.destinationPath),
					dependency.destinationPath,
				)
				.split(path.sep)
				.join("/");
			run("install_name_tool", [
				"-change",
				dependency.originalReference,
				`@loader_path/${relative}`,
				record.destinationPath,
			]);
		}
		if (record.kind === "library") {
			run("install_name_tool", [
				"-id",
				`@loader_path/${path.basename(record.destinationPath)}`,
				record.destinationPath,
			]);
		}
	}

	for (const record of records.filter(({ kind }) => kind === "library")) {
		run("codesign", [
			"--force",
			"--sign",
			"-",
			"--timestamp=none",
			record.destinationPath,
		]);
	}
	for (const record of records.filter(({ kind }) => kind === "binary")) {
		run("codesign", [
			"--force",
			"--sign",
			"-",
			"--timestamp=none",
			record.destinationPath,
		]);
	}

	for (const record of records) {
		assertArm64(record.destinationPath);
		for (const dependency of readDependencies(record.destinationPath)) {
			if (isSystemDependency(dependency)) continue;
			if (!dependency.startsWith("@loader_path/")) {
				throw new Error(
					`${record.destinationPath} still has external dependency ${dependency}`,
				);
			}
			const bundledPath = path.resolve(
				path.dirname(record.destinationPath),
				dependency.slice("@loader_path/".length),
			);
			if (!existsSync(bundledPath)) {
				throw new Error(`Bundled dependency is missing: ${bundledPath}`);
			}
		}
	}

	for (const binary of sourceBinaries) {
		run(path.join(outputDirectory, binary.name), ["-version"], {
			env: Object.fromEntries(
				Object.entries(process.env).filter(([key]) => !key.startsWith("DYLD_")),
			),
		});
	}

	return records;
}

function writeManifest({ formulaMetadata, outputDirectory, records, version }) {
	const manifestPath = path.join(
		repoRoot,
		"resources",
		"ffmpeg",
		"manifest.local.json",
	);
	const runtimeLibraries = Object.fromEntries(
		records
			.filter(({ kind }) => kind === "library")
			.map(({ destinationPath }) => [
				path.basename(destinationPath),
				{ sha256: sha256(destinationPath) },
			]),
	);
	const manifest = {
		version: 1,
		bundles: {
			"darwin-arm64": {
				version,
				sourceUrl: formulaMetadata.sourceUrl,
				license: formulaMetadata.license,
				origin: "Homebrew bottle, runtime libraries bundled locally",
				files: {
					ffmpeg: { sha256: sha256(path.join(outputDirectory, "ffmpeg")) },
					ffprobe: { sha256: sha256(path.join(outputDirectory, "ffprobe")) },
				},
				runtimeLibraries,
			},
		},
	};
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
		mode: 0o600,
	});
	return manifestPath;
}

function main() {
	if (process.platform !== "darwin" || process.arch !== "arm64") {
		throw new Error("This preparation script requires macOS ARM64");
	}
	const prefix = readArg(
		"prefix",
		process.env.SHOTLYX_HOMEBREW_FFMPEG_PREFIX ?? "/opt/homebrew/opt/ffmpeg",
	);
	if (!existsSync(prefix)) {
		throw new Error(`Homebrew FFmpeg prefix does not exist: ${prefix}`);
	}
	const formulaMetadata = readFormulaMetadata(prefix);
	const versionOutput = run(path.join(prefix, "bin", "ffmpeg"), ["-version"]);
	const version = versionOutput.match(/^ffmpeg version (\S+)/m)?.[1];
	if (!version) throw new Error("Could not detect the Homebrew FFmpeg version");

	const outputDirectory = path.join(
		repoRoot,
		"resources",
		"ffmpeg",
		"darwin-arm64",
	);
	const records = buildPortableBundle({ outputDirectory, prefix });
	const manifestPath = writeManifest({
		formulaMetadata,
		outputDirectory,
		records,
		version,
	});
	console.log(
		`Prepared portable macOS ARM64 FFmpeg ${version} with ${records.length - 2} runtime libraries`,
	);
	console.log(`Wrote provenance manifest ${manifestPath}`);
}

const isDirectExecution =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
	try {
		main();
	} catch (error) {
		console.error(`FFmpeg preparation failed: ${error.message}`);
		process.exitCode = 1;
	}
}
