export type ErrorCategory =
	| "param_error"
	| "state_error"
	| "not_found"
	| "system_error";

export interface ClassifiedError {
	category: ErrorCategory;
	message: string;
	suggestion?: string;
}

const PARAM_PATTERNS = [
	/参数格式错误/,
	/类型不匹配/,
	/必须为/,
	/无效的/,
	/required/i,
	/invalid/i,
	/must be/i,
];

const NOT_FOUND_PATTERNS = [
	/不存在/,
	/找不到/,
	/not found/i,
	/no such/i,
	/undefined/i,
];

const STATE_PATTERNS = [
	/尚未/,
	/已经/,
	/无法/,
	/cannot/i,
	/already/i,
	/not ready/i,
	/not loaded/i,
];

export function classifyError(error: string): ClassifiedError {
	for (const pattern of PARAM_PATTERNS) {
		if (pattern.test(error)) {
			return {
				category: "param_error",
				message: error,
				suggestion: "检查参数类型和格式是否正确",
			};
		}
	}

	for (const pattern of NOT_FOUND_PATTERNS) {
		if (pattern.test(error)) {
			return {
				category: "not_found",
				message: error,
				suggestion:
					"使用 timeline_get_summary 或 selection_get_state 查询可用资源",
			};
		}
	}

	for (const pattern of STATE_PATTERNS) {
		if (pattern.test(error)) {
			return {
				category: "state_error",
				message: error,
				suggestion: "检查当前编辑器状态，可能需要先执行前置操作",
			};
		}
	}

	return {
		category: "system_error",
		message: error,
	};
}

export function isRetryable(category: ErrorCategory): boolean {
	return category === "param_error" || category === "not_found";
}
