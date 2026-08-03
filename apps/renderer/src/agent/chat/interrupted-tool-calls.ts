import type { ChatSession } from "./types";

export const INTERRUPTED_TOOL_CALL_ERROR =
	"应用重启或页面刷新，中断了这次工具调用。请重新发送请求。";

export function recoverInterruptedToolCalls(
	sessions: ChatSession[],
): ChatSession[] {
	let sessionsChanged = false;
	const nextSessions = sessions.map((session) => {
		let sessionChanged = false;
		const messages = session.messages.map((message) => {
			if (!message.toolCalls?.some((toolCall) => !toolCall.result)) {
				return message;
			}

			sessionChanged = true;
			return {
				...message,
				toolCalls: message.toolCalls.map((toolCall) =>
					toolCall.result
						? toolCall
						: {
								...toolCall,
								result: {
									status: "error" as const,
									error: INTERRUPTED_TOOL_CALL_ERROR,
								},
							},
				),
			};
		});

		if (!sessionChanged) return session;
		sessionsChanged = true;
		return { ...session, messages };
	});

	return sessionsChanged ? nextSessions : sessions;
}
