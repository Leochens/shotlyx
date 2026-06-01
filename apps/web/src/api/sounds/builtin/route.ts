import { ApiResponse, type ApiRequest } from "@/platform/http";
import { renderBuiltInSoundWav } from "@/sounds/builtin-audio";
import { getBuiltInSoundEffectDefinitionById } from "@/sounds/builtin-library";

export async function GET(request: ApiRequest) {
	const { searchParams } = new URL(request.url);
	const id = Number(searchParams.get("id"));

	if (!Number.isInteger(id)) {
		return ApiResponse.json(
			{ error: "Invalid built-in sound id" },
			{ status: 400 },
		);
	}

	const definition = getBuiltInSoundEffectDefinitionById(id);
	if (!definition) {
		return ApiResponse.json(
			{ error: "Built-in sound not found" },
			{ status: 404 },
		);
	}

	const bytes = renderBuiltInSoundWav({ definition });
	return new Response(bytes, {
		headers: {
			"Cache-Control": "public, max-age=31536000, immutable",
			"Content-Length": bytes.byteLength.toString(),
			"Content-Type": "audio/wav",
		},
	});
}
