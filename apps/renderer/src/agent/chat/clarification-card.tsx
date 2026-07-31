"use client";

import type { ClarificationRequest } from "@/agent/controller/types";
import { QuestionnaireCard } from "./questionnaire-card";

export function ClarificationCard({
	clarification,
	onAnswer,
}: {
	clarification: ClarificationRequest;
	onAnswer?: (answer: string) => void;
}) {
	return (
		<QuestionnaireCard
			title={clarification.title}
			description={clarification.reason}
			question={clarification.question}
			options={clarification.options}
			allowOther={clarification.allowOther}
			onAnswer={(answer) => onAnswer?.(answer)}
		/>
	);
}
