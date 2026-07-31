export function requireStringParam(
	params: Record<string, unknown>,
	key: string,
): string {
	const value = params[key];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(
			`参数缺失："${key}" 为必填项，且必须为非空字符串`,
		);
	}
	return value;
}

export function requireNumberParam(
	params: Record<string, unknown>,
	key: string,
): number {
	const value = params[key];
	if (typeof value !== "number" || Number.isNaN(value)) {
		throw new Error(
			`参数缺失："${key}" 为必填项，且必须为有效数字`,
		);
	}
	return value;
}

export function optionalStringParam(
	params: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = params[key];
	if (value === undefined) return undefined;
	if (typeof value !== "string") {
		throw new Error(`类型不匹配："${key}" 必须为字符串`);
	}
	return value;
}

export function optionalNumberParam(
	params: Record<string, unknown>,
	key: string,
): number | undefined {
	const value = params[key];
	if (value === undefined) return undefined;
	if (typeof value !== "number" || Number.isNaN(value)) {
		throw new Error(`类型不匹配："${key}" 必须为有效数字`);
	}
	return value;
}

export function optionalBooleanParam(
	params: Record<string, unknown>,
	key: string,
): boolean | undefined {
	const value = params[key];
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") {
		throw new Error(`类型不匹配："${key}" 必须为布尔值`);
	}
	return value;
}

export function requireEnumParam<T extends string>(
	params: Record<string, unknown>,
	key: string,
	allowed: readonly T[],
): T {
	const value = requireStringParam(params, key);
	if (!allowed.includes(value as T)) {
		throw new Error(
			`类型不匹配："${key}" 必须为以下之一：${allowed.join(", ")}。实际值："${value}"`,
		);
	}
	return value as T;
}
