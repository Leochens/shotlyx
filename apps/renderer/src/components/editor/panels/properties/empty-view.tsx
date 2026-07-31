import { HugeiconsIcon } from "@hugeicons/react";
import { Settings05Icon } from "@hugeicons/core-free-icons";
import { useAppLocale } from "@/i18n/use-app-locale";

export function EmptyView() {
	const { copy } = useAppLocale();
	const propertiesCopy = copy.editor.properties;

	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-4">
			<HugeiconsIcon
				icon={Settings05Icon}
				className="size-10 text-muted-foreground/75"
				strokeWidth={1}
			/>
			<div className="flex max-w-52 flex-col gap-2 text-center">
				<p className="text-base font-medium text-foreground">
					{propertiesCopy.emptyTitle}
				</p>
				<p className="text-balance text-sm text-muted-foreground">
					{propertiesCopy.emptyBody}
				</p>
			</div>
		</div>
	);
}
