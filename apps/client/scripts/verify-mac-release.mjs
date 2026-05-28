import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (process.platform !== "darwin") {
	process.exit(0);
}

const clientDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	".."
);
const packageJson = JSON.parse(
	fs.readFileSync(path.join(clientDir, "package.json"), "utf8")
);
const productName = packageJson.productName ?? "Shotlyx Desktop";
const releaseDir = path.join(clientDir, "release");

function findMacApp() {
	if (process.env.SHOTLYX_MAC_APP_PATH) {
		return process.env.SHOTLYX_MAC_APP_PATH;
	}

	const candidates = [
		`mac-${process.arch}`,
		"mac-arm64",
		"mac-x64",
		"mac-universal",
		"mac",
	].map((dirName) => path.join(releaseDir, dirName, `${productName}.app`));

	return candidates.find((candidate) => fs.existsSync(candidate));
}

function run(command, args) {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});

	return {
		status: result.status ?? 1,
		output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
	};
}

function fail({ title, output }) {
	console.error(`\n${title}\n${output}\n`);
	process.exit(1);
}

const appPath = findMacApp();
if (!appPath) {
	fail({
		title: "No macOS .app bundle found to verify.",
		output: `Expected ${productName}.app under ${releaseDir}/mac-*`,
	});
}

const codesign = run("codesign", [
	"--verify",
	"--deep",
	"--strict",
	"--verbose=2",
	appPath,
]);
if (codesign.status !== 0) {
	fail({
		title: "codesign verification failed.",
		output: codesign.output,
	});
}

const spctl = run("spctl", [
	"--assess",
	"--type",
	"execute",
	"--verbose=4",
	appPath,
]);
if (spctl.status !== 0) {
	fail({
		title: "Gatekeeper rejected the macOS app.",
		output: `${spctl.output}\n\nThis usually means the app was signed but not notarized. Re-run dist:mac with Apple notarization credentials.`,
	});
}

const stapler = run("xcrun", ["stapler", "validate", appPath]);
if (stapler.status !== 0) {
	fail({
		title: "Stapled notarization ticket validation failed.",
		output: `${stapler.output}\n\nThe app should be notarized and stapled before distribution.`,
	});
}

console.log(`macOS release verification passed for ${appPath}`);
