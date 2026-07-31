import { describe, expect, mock, test } from "bun:test";
import { searchStockMedia } from "@/agent/tools/stock-media/provider-registry";
import { FreesoundProvider } from "@/agent/tools/stock-media/providers/freesound-provider";
import { PexelsProvider } from "@/agent/tools/stock-media/providers/pexels-provider";
import { PixabayProvider } from "@/agent/tools/stock-media/providers/pixabay-provider";

describe("stock media providers", () => {
	test("PexelsProvider maps video search results into stock assets", async () => {
		const fetchMock = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(String(input));
				expect(url.href).toStartWith(
					"https://api.pexels.com/v1/videos/search?",
				);
				expect(url.searchParams.get("query")).toBe("office work");
				expect(url.searchParams.get("orientation")).toBe("landscape");
				expect(init?.headers).toEqual({ Authorization: "pexels-key" });

				return new Response(
					JSON.stringify({
						videos: [
							{
								id: 123,
								width: 1920,
								height: 1080,
								url: "https://www.pexels.com/video/office-123/",
								image: "https://images.pexels.com/videos/123/thumb.jpeg",
								duration: 7,
								user: {
									name: "Jane Creator",
									url: "https://www.pexels.com/@jane",
								},
								video_files: [
									{
										id: 1,
										width: 3840,
										height: 2160,
										quality: "uhd",
										file_type: "video/mp4",
										link: "https://videos.pexels.com/uhd.mp4",
									},
									{
										id: 2,
										width: 1920,
										height: 1080,
										quality: "hd",
										file_type: "video/mp4",
										link: "https://videos.pexels.com/hd.mp4",
									},
								],
							},
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			},
		);

		const provider = new PexelsProvider({
			apiKey: "pexels-key",
			fetchFn: fetchMock,
		});

		const results = await provider.search({
			query: "office work",
			type: "video",
			orientation: "landscape",
			count: 3,
			resolution: "fullhd",
		});

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			provider: "pexels",
			providerAssetId: "123",
			type: "video",
			title: "Pexels video 123",
			previewUrl: "https://videos.pexels.com/hd.mp4",
			thumbnailUrl: "https://images.pexels.com/videos/123/thumb.jpeg",
			downloadUrl: "https://videos.pexels.com/hd.mp4",
			sourceUrl: "https://www.pexels.com/video/office-123/",
			width: 1920,
			height: 1080,
			durationSeconds: 7,
			author: {
				name: "Jane Creator",
				url: "https://www.pexels.com/@jane",
			},
			license: {
				name: "Pexels License",
				attributionRequired: false,
				commercialUse: true,
			},
		});
	});

	test("PixabayProvider maps video search results into stock assets", async () => {
		const fetchMock = mock(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			expect(url.href).toStartWith("https://pixabay.com/api/videos/?");
			expect(url.searchParams.get("key")).toBe("pixabay-key");
			expect(url.searchParams.get("q")).toBe("city night");
			expect(url.searchParams.get("video_type")).toBe("film");

			return new Response(
				JSON.stringify({
					hits: [
						{
							id: 456,
							pageURL: "https://pixabay.com/videos/city-456/",
							tags: "city, night, traffic",
							duration: 12,
							user: "City Shooter",
							user_id: 78,
							videos: {
								large: {
									url: "https://cdn.pixabay.com/video-large.mp4",
									width: 1920,
									height: 1080,
									size: 10_000,
								},
								medium: {
									url: "https://cdn.pixabay.com/video-medium.mp4",
									width: 1280,
									height: 720,
									size: 5_000,
								},
							},
						},
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});

		const provider = new PixabayProvider({
			apiKey: "pixabay-key",
			fetchFn: fetchMock,
		});

		const results = await provider.search({
			query: "city night",
			type: "video",
			count: 2,
			resolution: "hd",
		});

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			provider: "pixabay",
			providerAssetId: "456",
			type: "video",
			title: "city, night, traffic",
			previewUrl: "https://cdn.pixabay.com/video-medium.mp4",
			downloadUrl: "https://cdn.pixabay.com/video-medium.mp4",
			sourceUrl: "https://pixabay.com/videos/city-456/",
			width: 1280,
			height: 720,
			durationSeconds: 12,
			author: {
				name: "City Shooter",
				url: "https://pixabay.com/users/City%20Shooter-78/",
			},
			license: {
				name: "Pixabay Content License",
				attributionRequired: false,
				commercialUse: true,
			},
		});
	});

	test("public-domain-only search does not return platform-licensed providers", async () => {
		const fetchMock = mock(async () => {
			throw new Error("Pexels and Pixabay should not be queried");
		});

		const result = await searchStockMedia({
			input: {
				query: "historic city archive",
				type: "video",
				licensePolicy: "public-domain-only",
			},
			deps: {
				apiKeys: {
					pexels: "pexels-key",
					pixabay: "pixabay-key",
				},
				fetchFn: fetchMock,
			},
		});

		expect(result.candidates).toEqual([]);
		expect(result.message).toContain("Public-domain-only video search");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("FreesoundProvider searches CC0 audio for public-domain-only requests", async () => {
		const fetchMock = mock(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			expect(url.href).toStartWith("https://freesound.org/apiv2/search/text/?");
			expect(url.searchParams.get("token")).toBe("freesound-key");
			expect(url.searchParams.get("query")).toBe("camera click");
			expect(url.searchParams.get("filter")).toContain(
				'license:"Creative Commons 0"',
			);
			expect(url.searchParams.get("fields")).toContain("previews");

			return new Response(
				JSON.stringify({
					results: [
						{
							id: 789,
							name: "Camera click.wav",
							url: "https://freesound.org/people/jane/sounds/789/",
							duration: 1.2,
							username: "jane",
							license: "http://creativecommons.org/publicdomain/zero/1.0/",
							type: "wav",
							filesize: 12345,
							previews: {
								"preview-hq-mp3": "https://cdn.freesound.org/previews/789.mp3",
							},
							images: {
								waveform_m: "https://cdn.freesound.org/waveforms/789.png",
							},
						},
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});

		const provider = new FreesoundProvider({
			apiKey: "freesound-key",
			fetchFn: fetchMock,
		});
		const results = await provider.search({
			query: "camera click",
			type: "audio",
			licensePolicy: "public-domain-only",
			count: 4,
			durationSeconds: { max: 3 },
		});

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			provider: "freesound",
			providerAssetId: "789",
			type: "audio",
			title: "Camera click.wav",
			previewUrl: "https://cdn.freesound.org/previews/789.mp3",
			downloadUrl: "https://cdn.freesound.org/previews/789.mp3",
			thumbnailUrl: "https://cdn.freesound.org/waveforms/789.png",
			sourceUrl: "https://freesound.org/people/jane/sounds/789/",
			durationSeconds: 1.2,
			author: {
				name: "jane",
				url: "https://freesound.org/people/jane/",
			},
			license: {
				name: "Creative Commons Zero (CC0)",
				attributionRequired: false,
				commercialUse: true,
				sourceProvider: "freesound",
			},
		});
	});

	test("audio search requires a Freesound key instead of querying video providers", async () => {
		const fetchMock = mock(async () => {
			throw new Error("Video providers should not be queried for audio");
		});

		await expect(
			searchStockMedia({
				input: {
					query: "soft whoosh",
					type: "audio",
				},
				deps: {
					apiKeys: {
						pexels: "pexels-key",
						pixabay: "pixabay-key",
					},
					fetchFn: fetchMock,
				},
			}),
		).rejects.toThrow(
			"configuration_error: missing FREESOUND_API_KEY. Audio stock search currently requires Freesound",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("audio search does not misreport unsupported video providers as missing Freesound key", async () => {
		const fetchMock = mock(async () => {
			throw new Error("Unsupported audio providers should not be queried");
		});

		const result = await searchStockMedia({
			input: {
				query: "soft piano",
				type: "audio",
				providers: ["pixabay"],
				licensePolicy: "safe-commercial",
			},
			deps: {
				apiKeys: {
					pixabay: "pixabay-key",
				},
				fetchFn: fetchMock,
			},
		});

		expect(result.candidates).toEqual([]);
		expect(result.message).toContain("provider_unsupported");
		expect(result.message).toContain("Freesound");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
