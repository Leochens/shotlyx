import { FreesoundProvider } from "./providers/freesound-provider";
import { PexelsProvider } from "./providers/pexels-provider";
import { PixabayProvider } from "./providers/pixabay-provider";
import type { FetchFn } from "./providers/helpers";
import type {
	StockAssetInput,
	StockMediaType,
	StockMediaProvider,
	StockMediaProviderId,
	StockSearchInput,
} from "./types";

export interface StockProviderApiKeys {
	pexels?: string;
	pixabay?: string;
	freesound?: string;
}

export interface StockProviderRegistryDeps {
	apiKeys?: StockProviderApiKeys;
	fetchFn?: FetchFn;
}

export interface StockSearchResult {
	candidates: StockAssetInput[];
	message?: string;
}

const PROVIDER_MEDIA_TYPES: Record<
	StockMediaProviderId,
	readonly StockMediaType[]
> = {
	pexels: ["video"],
	pixabay: ["video"],
	freesound: ["audio"],
};

const PROVIDER_API_KEY_NAMES: Record<StockMediaProviderId, string> = {
	pexels: "PEXELS_API_KEY",
	pixabay: "PIXABAY_API_KEY",
	freesound: "FREESOUND_API_KEY",
};

function providerSupportsType({
	provider,
	type,
}: {
	provider: StockMediaProviderId;
	type: StockMediaType;
}): boolean {
	return PROVIDER_MEDIA_TYPES[provider].includes(type);
}

function requestedProvidersForInput(
	input: StockSearchInput,
): StockMediaProviderId[] {
	if (input.providers?.length) return input.providers;
	if (input.type === "audio") return ["freesound"];
	return ["pexels", "pixabay"];
}

function unsupportedProvidersMessage({
	input,
	providers,
}: {
	input: StockSearchInput;
	providers: StockMediaProviderId[];
}): string {
	const requested = providers.join(", ");
	if (input.type === "audio") {
		return `provider_unsupported: ${requested} do not support audio search. Audio stock search is currently supported by Freesound only; configure FREESOUND_API_KEY or use uploaded/user-provided audio.`;
	}
	if (input.type === "video") {
		return `provider_unsupported: ${requested} do not support video search. Video stock search is currently supported by Pexels and Pixabay.`;
	}
	return `provider_unsupported: ${requested} do not support ${input.type} search.`;
}

function missingApiKeyMessage({
	input,
	providers,
}: {
	input: StockSearchInput;
	providers: StockMediaProviderId[];
}): string {
	const keyNames = providers.map(
		(provider) => PROVIDER_API_KEY_NAMES[provider],
	);
	if (input.type === "audio") {
		return `configuration_error: missing ${keyNames.join(" or ")}. Audio stock search currently requires Freesound; configure FREESOUND_API_KEY or use uploaded/user-provided audio.`;
	}
	return `configuration_error: missing stock media API keys (${keyNames.join(" or ")}).`;
}

function buildProvider({
	id,
	apiKeys,
	fetchFn,
}: {
	id: StockMediaProviderId;
	apiKeys: StockProviderApiKeys;
	fetchFn: FetchFn;
}): StockMediaProvider | null {
	if (id === "pexels") {
		return apiKeys.pexels
			? new PexelsProvider({ apiKey: apiKeys.pexels, fetchFn })
			: null;
	}
	if (id === "pixabay") {
		return apiKeys.pixabay
			? new PixabayProvider({ apiKey: apiKeys.pixabay, fetchFn })
			: null;
	}
	if (id === "freesound") {
		return apiKeys.freesound
			? new FreesoundProvider({ apiKey: apiKeys.freesound, fetchFn })
			: null;
	}
	return null;
}

export function createStockMediaProviders({
	apiKeys = {},
	fetchFn = fetch,
	providers,
}: StockProviderRegistryDeps & {
	providers?: StockMediaProviderId[];
}): StockMediaProvider[] {
	const providerIds: StockMediaProviderId[] = providers?.length
		? providers
		: ["pexels", "pixabay"];
	return providerIds
		.map((id) => buildProvider({ id, apiKeys, fetchFn }))
		.filter((provider): provider is StockMediaProvider => provider !== null);
}

export async function searchStockMedia({
	input,
	deps = {},
}: {
	input: StockSearchInput;
	deps?: StockProviderRegistryDeps;
}): Promise<StockSearchResult> {
	if (input.licensePolicy === "public-domain-only") {
		if (input.type === "audio") {
			const requestedProviders = requestedProvidersForInput(input);
			const supportedProviders = requestedProviders.filter((provider) =>
				providerSupportsType({ provider, type: input.type }),
			);
			if (supportedProviders.length === 0) {
				return {
					candidates: [],
					message: unsupportedProvidersMessage({
						input,
						providers: requestedProviders,
					}),
				};
			}
			const audioProviders = createStockMediaProviders({
				...deps,
				providers: supportedProviders,
			});
			if (audioProviders.length === 0) {
				throw new Error(
					missingApiKeyMessage({ input, providers: supportedProviders }),
				);
			}
			const settled = await Promise.allSettled(
				audioProviders.map((provider) => provider.search(input)),
			);
			return {
				candidates: settled.flatMap((result) =>
					result.status === "fulfilled" ? result.value : [],
				),
			};
		}
		return {
			candidates: [],
			message:
				"Public-domain-only video search is not available yet. Pexels and Pixabay are platform-licensed sources, not Public Domain/CC0 sources.",
		};
	}

	const requestedProviders = requestedProvidersForInput(input);
	const supportedProviders = requestedProviders.filter((provider) =>
		providerSupportsType({ provider, type: input.type }),
	);
	const unsupportedProviders = requestedProviders.filter(
		(provider) => !supportedProviders.includes(provider),
	);
	const warningMessage =
		unsupportedProviders.length > 0
			? unsupportedProvidersMessage({
					input,
					providers: unsupportedProviders,
				})
			: undefined;

	if (supportedProviders.length === 0) {
		return {
			candidates: [],
			message: warningMessage,
		};
	}

	const providers = createStockMediaProviders({
		...deps,
		providers: supportedProviders,
	});
	if (providers.length === 0) {
		throw new Error(
			missingApiKeyMessage({ input, providers: supportedProviders }),
		);
	}

	const settled = await Promise.allSettled(
		providers.map((provider) => provider.search(input)),
	);
	const candidates = settled.flatMap((result) =>
		result.status === "fulfilled" ? result.value : [],
	);
	if (
		candidates.length === 0 &&
		settled.every((r) => r.status === "rejected")
	) {
		const message = settled
			.map((result) =>
				result.status === "rejected" && result.reason instanceof Error
					? result.reason.message
					: null,
			)
			.filter(Boolean)
			.join("; ");
		throw new Error(message || "provider_error: stock media search failed");
	}

	return {
		candidates: candidates.slice(0, input.count ?? 8),
		message: warningMessage,
	};
}
