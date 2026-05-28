import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const repoRoot = path.resolve(clientDir, "../..");
const apiDistDir = path.join(repoRoot, "apps/web/dist-electron");
const outputDir = path.join(clientDir, ".desktop-api");

async function assertFile(filePath, label) {
	const stat = await fs.stat(filePath).catch(() => null);
	if (!stat?.isFile()) {
		throw new Error(`${label} is missing. Run the desktop API build first.`);
	}
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
