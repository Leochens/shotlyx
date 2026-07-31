import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appDataDir =
	process.platform === "darwin"
		? path.join(os.homedir(), "Library", "Application Support")
		: process.env.APPDATA || path.join(os.homedir(), ".config");

const productDirs = ["Shotlyx Desktop Dev", "Shotlyx Desktop", "Shotlyx"];
const cacheDirs = [
	"GPUCache",
	"DawnWebGPUCache",
	"Code Cache",
	"ShaderCache",
	"GrShaderCache",
];

async function removeIfExists(targetPath) {
	const stat = await fs.stat(targetPath).catch(() => null);
	if (!stat) return false;
	await fs.rm(targetPath, { recursive: true, force: true });
	return true;
}

let removedCount = 0;

for (const productDir of productDirs) {
	for (const cacheDir of cacheDirs) {
		const targetPath = path.join(appDataDir, productDir, cacheDir);
		if (await removeIfExists(targetPath)) {
			removedCount += 1;
			console.log(`Removed ${targetPath}`);
		}
	}
}

if (removedCount === 0) {
	console.log("No Shotlyx desktop render caches were found.");
} else {
	const directoryWord = removedCount === 1 ? "directory" : "directories";
	console.log(
		`Removed ${removedCount} Shotlyx desktop render cache ${directoryWord}. Project data was preserved.`,
	);
}
