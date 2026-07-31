const fs = require("node:fs/promises");
const path = require("node:path");

const ELECTRON_BUILDER_ARCH_NAMES = {
	0: "ia32",
	1: "x64",
	2: "armv7l",
	3: "arm64",
	4: "universal",
};

function getResourcesDir(context) {
	if (context.electronPlatformName !== "darwin") {
		return path.join(context.appOutDir, "resources");
	}
	return path.join(
		context.appOutDir,
		`${context.packager.appInfo.productFilename}.app`,
		"Contents",
		"Resources",
	);
}

function getArchName(arch) {
	if (typeof arch === "string") return arch;
	return ELECTRON_BUILDER_ARCH_NAMES[arch] || process.arch;
}

function resolveFfmpegBundleKey(context) {
	const platform = context.electronPlatformName;
	const arch = getArchName(context.arch);
	if (platform === "darwin" && arch === "universal") {
		return process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
	}
	return `${platform}-${arch}`;
}

async function copyBundle({ bundle, resourcesDir }) {
	const destination = path.join(resourcesDir, bundle.name);
	await fs.rm(destination, {
		recursive: true,
		force: true,
	});
	await fs.mkdir(path.dirname(destination), { recursive: true });
	await fs.cp(bundle.source, destination, {
		recursive: true,
		force: true,
		dereference: false,
		verbatimSymlinks: true,
	});
}

function buildResourceBundles(context) {
	const clientDir = context.packager.projectDir;
	const repoRoot = path.resolve(clientDir, "../..");
	const ffmpegBundleKey = resolveFfmpegBundleKey(context);
	const ffmpegSource = path.join(
		repoRoot,
		"resources",
		"ffmpeg",
		ffmpegBundleKey,
	);
	return [
		{ source: path.join(clientDir, ".desktop-web"), name: "desktop-web" },
		{ source: path.join(clientDir, ".desktop-api"), name: "desktop-api" },
		{
			source: ffmpegSource,
			name: path.join("ffmpeg", ffmpegBundleKey),
		},
	];
}

async function afterPack(context) {
	const bundles = [...buildResourceBundles(context)];
	const resourcesDir = getResourcesDir(context);

	for (const bundle of bundles) {
		await copyBundle({ bundle, resourcesDir });
	}
}

exports.buildResourceBundles = buildResourceBundles;
exports.resolveFfmpegBundleKey = resolveFfmpegBundleKey;
exports.default = afterPack;
