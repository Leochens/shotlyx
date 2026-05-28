import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(clientDir, "../..");
const apiDistDir = path.join(repoRoot, "apps/web/dist-electron");
const outputDir = path.join(clientDir, ".desktop-api");
const bunStoreDir = path.join(repoRoot, "node_modules/.bun");

async function assertFile(filePath, label) {
	const stat = await fs.stat(filePath).catch(() => null);
	if (!stat?.isFile()) {
		throw new Error(`${label} is missing. Run the desktop API build first.`);
	}
}

function bunStorePrefixForPackage(packageName) {
	return packageName.replace("/", "+");
}

async function readJsonFile(filePath) {
	return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function findBunPackageRoot(packageName, expectedVersion) {
	const entries = await fs.readdir(bunStoreDir).catch(() => []);
	const prefix = `${bunStorePrefixForPackage(packageName)}@`;
	for (const entry of entries) {
		if (!entry.startsWith(prefix)) continue;
		const packageRoot = path.join(
			bunStoreDir,
			entry,
			"node_modules",
			...packageName.split("/"),
		);
		const packageJsonPath = path.join(packageRoot, "package.json");
		const packageJson = await readJsonFile(packageJsonPath).catch(() => null);
		if (packageJson?.name !== packageName) continue;
		if (expectedVersion && packageJson.version !== expectedVersion) continue;
		return packageRoot;
	}
	throw new Error(
		`Unable to find ${packageName}${
			expectedVersion ? `@${expectedVersion}` : ""
		} in ${bunStoreDir}. Run bun install before preparing the desktop API.`,
	);
}

function getEsbuildPlatformPackageName() {
	const platformKey = `${process.platform} ${os.arch()} ${os.endianness()}`;
	const knownPackages = {
		"aix ppc64 BE": "@esbuild/aix-ppc64",
		"android arm LE": "@esbuild/android-arm",
		"android arm64 LE": "@esbuild/android-arm64",
		"android x64 LE": "@esbuild/android-x64",
		"darwin arm64 LE": "@esbuild/darwin-arm64",
		"darwin x64 LE": "@esbuild/darwin-x64",
		"freebsd arm64 LE": "@esbuild/freebsd-arm64",
		"freebsd x64 LE": "@esbuild/freebsd-x64",
		"linux arm LE": "@esbuild/linux-arm",
		"linux arm64 LE": "@esbuild/linux-arm64",
		"linux ia32 LE": "@esbuild/linux-ia32",
		"linux loong64 LE": "@esbuild/linux-loong64",
		"linux mips64el LE": "@esbuild/linux-mips64el",
		"linux ppc64 LE": "@esbuild/linux-ppc64",
		"linux riscv64 LE": "@esbuild/linux-riscv64",
		"linux s390x BE": "@esbuild/linux-s390x",
		"linux x64 LE": "@esbuild/linux-x64",
		"netbsd arm64 LE": "@esbuild/netbsd-arm64",
		"netbsd x64 LE": "@esbuild/netbsd-x64",
		"openbsd arm64 LE": "@esbuild/openbsd-arm64",
		"openbsd x64 LE": "@esbuild/openbsd-x64",
		"openharmony arm64 LE": "@esbuild/openharmony-arm64",
		"sunos x64 LE": "@esbuild/sunos-x64",
		"win32 arm64 LE": "@esbuild/win32-arm64",
		"win32 ia32 LE": "@esbuild/win32-ia32",
		"win32 x64 LE": "@esbuild/win32-x64",
	};
	const packageName = knownPackages[platformKey];
	if (!packageName) {
		throw new Error(`Unsupported esbuild desktop platform: ${platformKey}`);
	}
	return packageName;
}

async function copyPackageToDesktopApiNodeModules(packageRoot, packageName) {
	const destination = path.join(
		outputDir,
		"node_modules",
		...packageName.split("/"),
	);
	await fs.mkdir(path.dirname(destination), { recursive: true });
	await fs.rm(destination, { recursive: true, force: true });
	await fs.cp(packageRoot, destination, {
		recursive: true,
		force: true,
		dereference: true,
	});
}

async function copyDesktopApiRuntimeDependencies() {
	const esbuildRoot = await findBunPackageRoot("esbuild");
	const esbuildPackage = await readJsonFile(
		path.join(esbuildRoot, "package.json"),
	);
	const platformPackageName = getEsbuildPlatformPackageName();
	const platformPackageVersion =
		esbuildPackage.optionalDependencies?.[platformPackageName] ??
		esbuildPackage.version;
	const platformPackageRoot = await findBunPackageRoot(
		platformPackageName,
		platformPackageVersion,
	);
	await copyPackageToDesktopApiNodeModules(esbuildRoot, "esbuild");
	await copyPackageToDesktopApiNodeModules(
		platformPackageRoot,
		platformPackageName,
	);
}

export async function prepareDesktopApiBundle() {
	await assertFile(
		path.join(apiDistDir, "desktop-api.mjs"),
		"Desktop API bundle",
	);
	await fs.rm(outputDir, { recursive: true, force: true });
	await fs.cp(apiDistDir, outputDir, {
		recursive: true,
		force: true,
		dereference: true,
	});
	await copyDesktopApiRuntimeDependencies();
	return outputDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	prepareDesktopApiBundle()
		.then((preparedPath) => {
			console.log(`Prepared desktop API bundle at ${preparedPath}`);
		})
		.catch((error) => {
			console.error(error);
			process.exit(1);
		});
}
