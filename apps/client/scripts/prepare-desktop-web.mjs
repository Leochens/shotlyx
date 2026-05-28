import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(clientDir, "../..");
const webDir = path.join(repoRoot, "apps/web");
const desktopDistDir = process.env.SHOTLYX_DESKTOP_DIST_DIR ?? ".next-desktop";
const desktopDistPath = path.join(webDir, desktopDistDir);
const standaloneDir = path.join(desktopDistPath, "standalone");
const staticDir = path.join(desktopDistPath, "static");
const publicDir = path.join(webDir, "public");
const outputDir = path.join(clientDir, ".desktop-web");
const textFileExtensions = new Set([
	".cjs",
	".css",
	".html",
	".js",
	".json",
	".map",
	".mjs",
	".txt",
	".xml",
	".yaml",
	".yml",
]);
const removableBuildArtifacts = [
	"apps/web/e2e",
	"apps/web/playwright-report",
	"apps/web/tsconfig.tsbuildinfo",
];

async function assertDirectory(directory, label) {
	const stat = await fs.stat(directory).catch(() => null);
	if (!stat?.isDirectory()) {
		throw new Error(`${label} is missing. Run the desktop web build first.`);
	}
}

async function copyDirectory({ from, to, dereference = false }) {
	await fs.cp(from, to, {
		recursive: true,
		force: true,
		dereference,
		verbatimSymlinks: !dereference,
	});
}

async function pathExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function removeBrokenSymlinks(directory) {
	const entries = await fs.readdir(directory, { withFileTypes: true });
	await Promise.all(
		entries.map(async (entry) => {
			const entryPath = path.join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				const linkTarget = await fs.readlink(entryPath);
				const resolvedTarget = path.isAbsolute(linkTarget)
					? linkTarget
					: path.resolve(directory, linkTarget);
				if (!(await pathExists(resolvedTarget))) {
					await fs.rm(entryPath, { force: true });
				}
				return;
			}

			if (entry.isDirectory()) {
				await removeBrokenSymlinks(entryPath);
			}
		}),
	);
}

async function exposeBunHoistedDependencies(bundleDir) {
	const nodeModulesDir = path.join(bundleDir, "node_modules");
	const bunNodeModulesDir = path.join(nodeModulesDir, ".bun", "node_modules");
	const stat = await fs.stat(bunNodeModulesDir).catch(() => null);
	if (!stat?.isDirectory()) return;

	const entries = await fs.readdir(bunNodeModulesDir, { withFileTypes: true });
	await Promise.all(
		entries.map((entry) =>
			copyDirectory({
				from: path.join(bunNodeModulesDir, entry.name),
				to: path.join(nodeModulesDir, entry.name),
				dereference: true,
			}),
		),
	);
}

async function sanitizeLocalBuildPaths(directory) {
	const replacements = [
		[pathToFileURL(repoRoot).href, "file:///shotlyx-source"],
		[repoRoot, "/shotlyx-source"],
	];

	async function visit(currentDirectory) {
		const entries = await fs.readdir(currentDirectory, { withFileTypes: true });
		await Promise.all(
			entries.map(async (entry) => {
				const entryPath = path.join(currentDirectory, entry.name);
				if (entry.isDirectory()) {
					await visit(entryPath);
					return;
				}
				if (!entry.isFile() || !textFileExtensions.has(path.extname(entry.name))) {
					return;
				}

				const original = await fs.readFile(entryPath, "utf8").catch(() => null);
				if (original === null) return;
				let next = original;
				for (const [needle, replacement] of replacements) {
					next = next.split(needle).join(replacement);
				}
				if (next !== original) {
					await fs.writeFile(entryPath, next);
				}
			}),
		);
	}

	await visit(directory);
}

async function removeNonRuntimeBuildArtifacts(bundleDir) {
	await Promise.all(
		removableBuildArtifacts.map((relativePath) =>
			fs.rm(path.join(bundleDir, relativePath), {
				recursive: true,
				force: true,
			}),
		),
	);
}

export async function prepareDesktopWebBundle() {
	await assertDirectory(standaloneDir, "Next standalone output");
	await assertDirectory(staticDir, "Next static output");
	await assertDirectory(publicDir, "Next public assets");

	const tempRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), "shotlyx-desktop-web-"),
	);
	const tempBundleDir = path.join(tempRoot, "bundle");

	await fs.rm(outputDir, { recursive: true, force: true });

	try {
		await copyDirectory({ from: standaloneDir, to: tempBundleDir });
		await copyDirectory({
			from: staticDir,
			to: path.join(tempBundleDir, "apps/web", desktopDistDir, "static"),
		});
		await copyDirectory({
			from: publicDir,
			to: path.join(tempBundleDir, "apps/web", "public"),
		});
		await removeBrokenSymlinks(tempBundleDir);
		await copyDirectory({
			from: tempBundleDir,
			to: outputDir,
			dereference: true,
		});
		await exposeBunHoistedDependencies(outputDir);
		await removeNonRuntimeBuildArtifacts(outputDir);
		await sanitizeLocalBuildPaths(outputDir);
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true });
	}

	return outputDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	prepareDesktopWebBundle()
		.then((preparedPath) => {
			console.log(`Prepared desktop web bundle at ${preparedPath}`);
		})
		.catch((error) => {
			console.error(error);
			process.exit(1);
		});
}
