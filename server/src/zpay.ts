import { createHash } from "node:crypto";

export type ZpayParams = Record<string, string | number | undefined | null>;
export type ZpayPayType = "alipay" | "wxpay";

export type ZpaySubmitInput = {
	pid: string;
	type: ZpayPayType;
	outTradeNo: string;
	notifyUrl: string;
	returnUrl: string;
	name: string;
	money: string;
	param?: string;
};

function normalizeParamValue(
	value: string | number | undefined | null,
): string {
	if (value === undefined || value === null) return "";
	return String(value);
}

export function buildZpaySignSource(params: ZpayParams): string {
	return Object.entries(params)
		.map(([key, value]) => [key, normalizeParamValue(value)] as const)
		.filter(
			([key, value]) => key !== "sign" && key !== "sign_type" && value !== "",
		)
		.sort(([left], [right]) => left.localeCompare(right, "en"))
		.map(([key, value]) => `${key}=${value}`)
		.join("&");
}

export function signZpayParams(params: ZpayParams, key: string): string {
	return createHash("md5")
		.update(`${buildZpaySignSource(params)}${key}`)
		.digest("hex")
		.toLowerCase();
}

export function verifyZpaySignature(params: ZpayParams, key: string): boolean {
	const expected = signZpayParams(params, key);
	return normalizeParamValue(params.sign).toLowerCase() === expected;
}

export function createZpaySubmitFields(
	input: ZpaySubmitInput,
	key: string,
): Record<string, string> {
	const fields: Record<string, string> = {
		pid: input.pid,
		type: input.type,
		out_trade_no: input.outTradeNo,
		notify_url: input.notifyUrl,
		return_url: input.returnUrl,
		name: input.name,
		money: input.money,
		param: input.param ?? "",
	};
	return {
		...fields,
		sign: signZpayParams(fields, key),
		sign_type: "MD5",
	};
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function renderZpayCheckoutPage({
	submitUrl,
	fields,
}: {
	submitUrl: string;
	fields: Record<string, string>;
}): string {
	return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>正在前往支付</title>
</head>
<body>
  <form id="zpay-checkout" method="post" action="${escapeHtml(submitUrl)}">
    ${Object.entries(fields)
			.map(
				([name, value]) =>
					`<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
			)
			.join("\n    ")}
    <button type="submit">继续支付</button>
  </form>
  <script>document.getElementById("zpay-checkout").submit();</script>
</body>
</html>`;
}
