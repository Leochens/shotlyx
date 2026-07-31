import assert from "node:assert/strict";
import test from "node:test";
import { detectBinaryArchitecture } from "./verify-ffmpeg.mjs";

function machO(cpuType) {
	const bytes = Buffer.alloc(8);
	bytes.writeUInt32LE(0xfeedfacf, 0);
	bytes.writeUInt32LE(cpuType, 4);
	return bytes;
}

function portableExecutable(machine) {
	const bytes = Buffer.alloc(72);
	bytes.write("MZ", 0, "ascii");
	bytes.writeUInt32LE(64, 0x3c);
	bytes.write("PE\u0000\u0000", 64, "ascii");
	bytes.writeUInt16LE(machine, 68);
	return bytes;
}

test("detects macOS ARM64 and x64 Mach-O binaries", () => {
	assert.equal(
		detectBinaryArchitecture({
			bytes: machO(0x0100000c),
			platform: "darwin",
		}),
		"arm64",
	);
	assert.equal(
		detectBinaryArchitecture({
			bytes: machO(0x01000007),
			platform: "darwin",
		}),
		"x64",
	);
});

test("detects Windows x64 and ARM64 PE binaries", () => {
	assert.equal(
		detectBinaryArchitecture({
			bytes: portableExecutable(0x8664),
			platform: "win32",
		}),
		"x64",
	);
	assert.equal(
		detectBinaryArchitecture({
			bytes: portableExecutable(0xaa64),
			platform: "win32",
		}),
		"arm64",
	);
});

test("rejects invalid executable headers", () => {
	assert.throws(
		() =>
			detectBinaryArchitecture({
				bytes: Buffer.alloc(8),
				platform: "darwin",
			}),
		/not a 64-bit little-endian Mach-O/,
	);
	assert.throws(
		() =>
			detectBinaryArchitecture({
				bytes: Buffer.alloc(72),
				platform: "win32",
			}),
		/not a Windows PE executable/,
	);
});
