import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(clientDir, "../..");
const webDir = path.join(repoRoot, "apps/renderer");
const viteDistDir = path.join(webDir, "dist");
const outputDir = path.join(clientDir, ".desktop-web");
const textFileExtensions = new Set([
	".css",
	".html",
	".js",
	".json",
	".map",
	".svg",
	".txt",
	".xml",
	".yaml",
	".yml",
]);

async function assertDirectory(directory, label) {
	const stat = await fs.stat(directory).catch(() => null);
	if (!stat?.isDirectory()) {
		throw new Error(`${label} is missing. Run the desktop web build first.`);
	}
}

async function copyDirectory({ from, to }) {
	await fs.cp(from, to, {
		recursive: true,
		force: true,
		dereference: true,
	});
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

export async function prepareDesktopWebBundle() {
	await assertDirectory(viteDistDir, "Vite renderer output");

	await fs.rm(outputDir, { recursive: true, force: true });
	await copyDirectory({ from: viteDistDir, to: outputDir });
	await assertDirectory(path.join(outputDir, "assets"), "Vite renderer assets");
	await sanitizeLocalBuildPaths(outputDir);

	return outputDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	prepareDesktopWebBundle()
		.then((preparedPath) => {
			console.log(`Prepared desktop renderer bundle at ${preparedPath}`);
		})
		.catch((error) => {
			console.error(error);
			process.exit(1);
		});
}
