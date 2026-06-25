import type { createBillingService } from "./billing";
import {
	getBillingProduct,
	getProductGrantedCredits,
	type BillingProduct,
	type BillingProductType,
} from "./product-catalog";
import type {
	PaymentOrder,
	PaymentOrderPayType,
	PublicUser,
	ShotlyxStore,
} from "./types";
import {
	createZpaySubmitFields,
	renderZpayCheckoutPage,
	verifyZpaySignature,
	type ZpayParams,
} from "./zpay";

export type ZpayPaymentConfig = {
	pid?: string;
	key?: string;
	submitUrl?: string;
	publicBaseUrl?: string;
	creditsPerCny?: number;
};

export type CreateCreditPaymentInput = {
	user: PublicUser;
	credits: number;
	type: PaymentOrderPayType;
};

export type CreateProductPaymentInput = {
	user: PublicUser;
	productType: BillingProductType;
	productCode: string;
	type: PaymentOrderPayType;
};

const DEFAULT_ZPAY_SUBMIT_URL = "https://zpayz.cn/submit.php";
const DEFAULT_CREDITS_PER_CNY = 10_000;

function normalizeBaseUrl(value: string | undefined): string {
	return value?.trim().replace(/\/+$/, "") ?? "";
}

function getZpayPid(config: ZpayPaymentConfig): string {
	return config.pid?.trim() || process.env.SHOTLYX_ZPAY_PID?.trim() || "";
}

function getZpayKey(config: ZpayPaymentConfig): string {
	return config.key?.trim() || process.env.SHOTLYX_ZPAY_KEY?.trim() || "";
}

function getZpaySubmitUrl(config: ZpayPaymentConfig): string {
	return (
		config.submitUrl?.trim() ||
		process.env.SHOTLYX_ZPAY_SUBMIT_URL?.trim() ||
		DEFAULT_ZPAY_SUBMIT_URL
	);
}

function getCreditsPerCny(config: ZpayPaymentConfig): number {
	const configured =
		config.creditsPerCny ?? Number(process.env.SHOTLYX_CREDITS_PER_CNY);
	return Number.isInteger(configured) && configured > 0
		? configured
		: DEFAULT_CREDITS_PER_CNY;
}

function getPublicBaseUrl(config: ZpayPaymentConfig): string {
	return normalizeBaseUrl(
		config.publicBaseUrl ?? process.env.SHOTLYX_SERVER_PUBLIC_URL,
	);
}

export function isZpayConfigured(config: ZpayPaymentConfig): boolean {
	return Boolean(
		getZpayPid(config) && getZpayKey(config) && getPublicBaseUrl(config),
	);
}

export function formatMoneyFromCents(cents: number): string {
	return (cents / 100).toFixed(2);
}

export function parseMoneyToCents(value: string): number | null {
	if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
	const [yuan = "0", cent = ""] = value.split(".");
	return Number(yuan) * 100 + Number(cent.padEnd(2, "0"));
}

function creditsToMoneyCents({
	credits,
	creditsPerCny,
}: {
	credits: number;
	creditsPerCny: number;
}): number {
	return Math.ceil((credits * 100) / creditsPerCny);
}

function createOutTradeNo(): string {
	return `sx_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function normalizePayType(value: PaymentOrderPayType): PaymentOrderPayType {
	return value === "wxpay" ? "wxpay" : "alipay";
}

function assertValidCredits(credits: number): void {
	if (!Number.isInteger(credits) || credits <= 0) {
		throw new Error("invalid_credit_amount");
	}
}

function createProductName(credits: number): string {
	return `Shotlyx API 额度充值 ${new Intl.NumberFormat("en-US").format(credits)} credits`;
}

function getCheckoutProductName(order: PaymentOrder): string {
	const productName = order.meta?.productName;
	return typeof productName === "string" && productName.trim()
		? productName
		: createProductName(order.credits);
}

function createProductOrderMeta({
	user,
	product,
}: {
	user: PublicUser;
	product: BillingProduct;
}) {
	return {
		userEmail: user.email,
		productType: product.type,
		productCode: product.code,
		productName: product.name,
		productPriceCents: product.priceCents,
	};
}

export function createPaymentService({
	store,
	billing,
	zpay = {},
	now = () => new Date(),
}: {
	store: ShotlyxStore;
	billing: ReturnType<typeof createBillingService>;
	zpay?: ZpayPaymentConfig;
	now?: () => Date;
}) {
	return {
		isConfigured(): boolean {
			return isZpayConfigured(zpay);
		},

		async createCreditTopUpPayment(input: CreateCreditPaymentInput) {
			if (!isZpayConfigured(zpay)) {
				throw new Error("zpay_not_configured");
			}
			assertValidCredits(input.credits);

			const creditsPerCny = getCreditsPerCny(zpay);
			const moneyCents = creditsToMoneyCents({
				credits: input.credits,
				creditsPerCny,
			});
			const timestamp = now().toISOString();
			const order: PaymentOrder = {
				id: `pay_${crypto.randomUUID()}`,
				provider: "zpay",
				userId: input.user.id,
				outTradeNo: createOutTradeNo(),
				credits: input.credits,
				moneyCents,
				payType: normalizePayType(input.type),
				status: "pending",
				createdAt: timestamp,
				updatedAt: timestamp,
				meta: {
					userEmail: input.user.email,
					creditsPerCny,
				},
			};
			await store.createPaymentOrder(order);
			return {
				order,
				checkoutUrl: `/api/account/credits/payments/${order.outTradeNo}/checkout`,
			};
		},

		async createProductCheckout(input: CreateProductPaymentInput) {
			if (!isZpayConfigured(zpay)) {
				throw new Error("zpay_not_configured");
			}
			const product = getBillingProduct({
				type: input.productType,
				code: input.productCode,
			});
			if (!product) throw new Error("billing_product_not_found");

			const timestamp = now().toISOString();
			const order: PaymentOrder = {
				id: `pay_${crypto.randomUUID()}`,
				provider: "zpay",
				userId: input.user.id,
				outTradeNo: createOutTradeNo(),
				credits: getProductGrantedCredits(product),
				moneyCents: product.priceCents,
				payType: normalizePayType(input.type),
				status: "pending",
				createdAt: timestamp,
				updatedAt: timestamp,
				meta: createProductOrderMeta({ user: input.user, product }),
			};
			await store.createPaymentOrder(order);
			return {
				order,
				checkoutUrl: `/api/account/credits/payments/${order.outTradeNo}/checkout`,
			};
		},

		async renderCheckout(outTradeNo: string): Promise<string> {
			if (!isZpayConfigured(zpay)) {
				throw new Error("zpay_not_configured");
			}
			const order = await store.findPaymentOrderByOutTradeNo(outTradeNo);
			if (!order) throw new Error("payment_order_not_found");
			const baseUrl = getPublicBaseUrl(zpay);
			const fields = createZpaySubmitFields(
				{
					pid: getZpayPid(zpay),
					type: order.payType,
					outTradeNo: order.outTradeNo,
					notifyUrl: `${baseUrl}/api/callbacks/zpay`,
					returnUrl: `${baseUrl}/projects`,
					name: getCheckoutProductName(order),
					money: formatMoneyFromCents(order.moneyCents),
					param: order.id,
				},
				getZpayKey(zpay),
			);
			return renderZpayCheckoutPage({
				submitUrl: getZpaySubmitUrl(zpay),
				fields,
			});
		},

		async handleZpayNotification(params: ZpayParams): Promise<PaymentOrder> {
			if (!isZpayConfigured(zpay)) {
				throw new Error("zpay_not_configured");
			}
			if (!verifyZpaySignature(params, getZpayKey(zpay))) {
				throw new Error("invalid_zpay_signature");
			}
			if (String(params.pid ?? "") !== getZpayPid(zpay)) {
				throw new Error("invalid_zpay_pid");
			}
			if (String(params.trade_status ?? "") !== "TRADE_SUCCESS") {
				throw new Error("zpay_trade_not_success");
			}

			const outTradeNo = String(params.out_trade_no ?? "");
			const order = await store.findPaymentOrderByOutTradeNo(outTradeNo);
			if (!order) throw new Error("payment_order_not_found");

			const notifiedMoneyCents = parseMoneyToCents(String(params.money ?? ""));
			if (notifiedMoneyCents !== order.moneyCents) {
				throw new Error("zpay_money_mismatch");
			}

			const paidAt = now().toISOString();
			await billing.topUpUserCredits({
				userId: order.userId,
				amount: order.credits,
				idempotencyKey: `zpay:${order.outTradeNo}`,
				externalPaymentId: String(params.trade_no ?? "") || undefined,
				note:
					typeof order.meta?.productName === "string"
						? `ZPAY self-service purchase: ${order.meta.productName}`
						: "ZPAY self-service recharge",
				meta: {
					...order.meta,
					paymentOrderId: order.id,
					provider: "zpay",
					payType: order.payType,
					money: formatMoneyFromCents(order.moneyCents),
				},
			});

			return store.updatePaymentOrder({
				...order,
				status: "paid",
				providerTradeNo: String(params.trade_no ?? "") || order.providerTradeNo,
				updatedAt: paidAt,
				paidAt,
			});
		},
	};
}
