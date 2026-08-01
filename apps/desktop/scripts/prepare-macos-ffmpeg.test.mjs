import assert from "node:assert/strict";
import test from "node:test";
import {
	isSystemDependency,
	parseOtoolDependencies,
} from "./prepare-macos-ffmpeg.mjs";

test("parses Mach-O dependency paths from otool output", () => {
	assert.deepEqual(
		parseOtoolDependencies(`/tmp/ffmpeg:
\t/opt/homebrew/lib/libcodec.dylib (compatibility version 1.0.0, current version 1.2.0)
\t/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation (compatibility version 300.0.0, current version 300.0.0)
`),
		[
			"/opt/homebrew/lib/libcodec.dylib",
			"/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation",
		],
	);
});

test("distinguishes system libraries from redistributable runtime libraries", () => {
	assert.equal(isSystemDependency("/usr/lib/libSystem.B.dylib"), true);
	assert.equal(
		isSystemDependency(
			"/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation",
		),
		true,
	);
	assert.equal(
		isSystemDependency("/opt/homebrew/opt/x264/lib/libx264.dylib"),
		false,
	);
});
