import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const testRoots = [
	"eslint/rules",
	"apps/desktop/scripts",
	"apps/renderer/src",
	"packages/local-api/src",
];
const isolatedTests = new Set([
	"apps/renderer/src/agent/tools/creative/__tests__/image-generation-provider.test.ts",
	"apps/renderer/src/api/agent/chat/__tests__/local-cli-route.test.ts",
	"apps/renderer/src/api/agent/transcription/__tests__/route.test.ts",
	"apps/renderer/src/api/agent/vision/__tests__/route.test.ts",
	"apps/renderer/src/api/agent/voiceover/clone/__tests__/route.test.ts",
	"apps/renderer/src/core/managers/__tests__/project-manager-duplicate.test.ts",
]);
const testFilePattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

function collectTestFiles(relativeDirectory) {
	const absoluteDirectory = path.join(repoRoot, relativeDirectory);
	return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap(
		(entry) => {
			const relativePath = path.join(relativeDirectory, entry.name);
			if (entry.isDirectory()) return collectTestFiles(relativePath);
			return entry.isFile() && testFilePattern.test(entry.name)
				? [relativePath]
				: [];
		},
	);
}

function runBunTests(files) {
	return new Promise((resolve, reject) => {
		const child = spawn("bun", ["test", ...files], {
			cwd: repoRoot,
			env: process.env,
			stdio: "inherit",
		});
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`Test process stopped by ${signal}`));
				return;
			}
			resolve(code ?? 1);
		});
	});
}

const allTests = testRoots.flatMap(collectTestFiles).sort();
const bulkTests = allTests.filter((file) => !isolatedTests.has(file));
const missingIsolatedTests = [...isolatedTests].filter(
	(file) => !allTests.includes(file),
);

if (missingIsolatedTests.length > 0) {
	throw new Error(
		`Missing isolated test files:\n${missingIsolatedTests.join("\n")}`,
	);
}

console.log(`Running ${bulkTests.length} unit test files in the main suite...`);
let status = await runBunTests(bulkTests);
if (status !== 0) process.exit(status);

for (const file of [...isolatedTests].sort()) {
	console.log(`Running isolated test suite: ${file}`);
	status = await runBunTests([file]);
	if (status !== 0) process.exit(status);
}
