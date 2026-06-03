import type { AgentContextReference } from "@/agent/context/types";
import type { TopicInputMaterialDraft } from "./model";

const SCREEN_RECORDING_PATTERN = /(录屏|screen\s*record|screen[-_\s]?cap)/i;

function materialKindFromMediaReference(
	reference: Extract<AgentContextReference, { kind: "media-asset" }>,
): TopicInputMaterialDraft["kind"] {
	if (
		reference.payload.type === "video" &&
		SCREEN_RECORDING_PATTERN.test(reference.payload.name)
	) {
		return "screen-recording";
	}
	return "uploaded-media";
}

export function buildTopicInputMaterialsFromReferences({
	references,
}: {
	references: AgentContextReference[];
}): TopicInputMaterialDraft[] {
	return references.flatMap((reference) => {
		if (reference.kind === "media-asset") {
			return [
				{
					id: `material-${reference.payload.mediaAssetId}`,
					kind: materialKindFromMediaReference(reference),
					title: reference.payload.name,
					summary: `${reference.payload.type} 素材已加入选题上下文。`,
					mediaAssetId: reference.payload.mediaAssetId,
					mediaType: reference.payload.type,
					durationSeconds: reference.payload.durationSeconds,
					sizeBytes: reference.payload.sizeBytes,
					createdAt: reference.createdAt,
				},
			];
		}

		if (reference.kind === "source-material") {
			return [
				{
					id: reference.payload.materialId,
					kind: reference.payload.materialType,
					title: reference.payload.name,
					summary: reference.payload.summary,
					content: reference.payload.content,
					mediaAssetId: reference.payload.mediaAssetId,
					mediaType: reference.payload.mediaType,
					durationSeconds: reference.payload.durationSeconds,
					sizeBytes: reference.payload.sizeBytes,
					createdAt: reference.createdAt,
				},
			];
		}

		return [];
	});
}
