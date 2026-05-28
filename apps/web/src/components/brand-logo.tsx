import Image from "@/platform/image";
import { PRODUCT_NAME } from "@/site/brand";
import { cn } from "@/utils/ui";

export const SHOTLYX_LOGO_SRC = "/logos/shotlyx/icon.png";

export function ShotlyxLogo({
	size = 32,
	className,
	imageClassName,
	priority = false,
	alt = `${PRODUCT_NAME} logo`,
}: {
	size?: number;
	className?: string;
	imageClassName?: string;
	priority?: boolean;
	alt?: string;
}) {
	return (
		<span
			className={cn("relative inline-flex shrink-0 overflow-hidden", className)}
			style={{ width: size, height: size }}
		>
			<Image
				src={SHOTLYX_LOGO_SRC}
				alt={alt}
				width={size}
				height={size}
				className={cn("h-full w-full object-contain", imageClassName)}
				priority={priority}
			/>
		</span>
	);
}
