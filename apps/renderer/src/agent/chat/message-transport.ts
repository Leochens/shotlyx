import type { AgentContextReference } from "@/agent/context/types";
import type { ChatMessage } from "./types";
import { buildToolResultContext } from "./tool-context";

export function toAgentRequestMessage(
	message: Pick<
		ChatMessage,
		"role" | "content" | "requestContent" | "toolCalls"
	> & {
		references?: AgentContextReference[];
	},
): {
	role: ChatMessage["role"];
	content: string;
	references?: AgentContextReference[];
} {
	return {
		role: message.role,
		content: `${message.requestContent ?? message.content}${buildToolResultContext(
			{
				toolCalls: message.toolCalls,
			},
		)}`,
		references: message.references,
	};
}
