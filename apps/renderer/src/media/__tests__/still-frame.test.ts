import { describe, expect, test } from "bun:test";
import { buildStillFrameAsset } from "../still-frame";

describe("buildStillFrameAsset", () => {
	test("wraps a snapshot blob as a regular image media asset", () => {
		const blob = new Blob(["png"], { type: "image/png" });
		const createdUrls: Blob[] = [];

		const asset = buildStillFrameAsset({
			blob,
			filename: "demo-00-00-01-00.png",
			width: 1920,
			height: 1080,
			thumbnailUrl: "data:image/jpeg;base64,thumb",
			now: () => 1234,
			createObjectUrl: (value) => {
				createdUrls.push(value);
				return "blob:still-frame";
			},
		});

		expect(asset).toMatchObject({
			name: "demo-00-00-01-00.png",
			type: "image",
			url: "blob:still-frame",
			thumbnailUrl: "data:image/jpeg;base64,thumb",
			width: 1920,
			height: 1080,
		});
		expect(asset.file).toBeInstanceOf(File);
		expect(asset.file.name).toBe("demo-00-00-01-00.png");
		expect(asset.file.type).toBe("image/png");
		expect(asset.file.lastModified).toBe(1234);
		expect(createdUrls).toEqual([asset.file]);
	});

	test("keeps a custom display name while preserving the png filename", () => {
		const asset = buildStillFrameAsset({
			blob: new Blob(["png"], { type: "image/png" }),
			filename: "project-00-00-02-00.png",
			name: "Freeze frame",
			width: 1280,
			height: 720,
			thumbnailUrl: "data:image/jpeg;base64,thumb",
			createObjectUrl: () => "blob:custom",
		});

		expect(asset.name).toBe("Freeze frame");
		expect(asset.file.name).toBe("project-00-00-02-00.png");
	});
});
