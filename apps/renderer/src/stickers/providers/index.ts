import { stickersRegistry } from "../registry";
import type { StickerProvider } from "@/stickers/types";
import { animatedStickersProvider } from "./animated-stickers";
import { logosProvider } from "./logos";
import { shapesProvider } from "./shapes";

const defaultProviders: StickerProvider[] = [
	logosProvider,
	shapesProvider,
	animatedStickersProvider,
];

export function registerDefaultStickerProviders({
	providersToRegister = defaultProviders,
}: {
	providersToRegister?: StickerProvider[];
} = {}): void {
	for (const provider of providersToRegister) {
		if (stickersRegistry.has(provider.id)) {
			continue;
		}
		stickersRegistry.register({
			key: provider.id,
			definition: provider,
		});
	}
}
