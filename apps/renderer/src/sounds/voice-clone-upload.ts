const SUPPORTED_VOLCENGINE_CLONE_FORMATS = new Set([
	"wav",
	"mp3",
	"ogg",
	"m4a",
	"aac",
	"pcm",
]);

export function getVoiceCloneUploadFormat({
	fileName,
	mimeType,
}: {
	fileName: string;
	mimeType: string;
}): string {
	const extension = fileName.split(".").pop()?.toLowerCase();
	if (extension && SUPPORTED_VOLCENGINE_CLONE_FORMATS.has(extension)) {
		return extension;
	}
	if (mimeType.includes("wav")) return "wav";
	if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
	if (mimeType.includes("ogg")) return "ogg";
	if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
	if (mimeType.includes("aac")) return "aac";
	return "wav";
}
