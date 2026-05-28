import { forwardRef, type ImgHTMLAttributes } from "react";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
	src: string | { src: string };
	fill?: boolean;
	priority?: boolean;
	quality?: number;
	sizes?: string;
	unoptimized?: boolean;
};

function resolveImageSrc(src: ImageProps["src"]): string {
	return typeof src === "string" ? src : src.src;
}

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
	{
		src,
		fill,
		priority: _priority,
		quality: _quality,
		unoptimized: _unoptimized,
		style,
		alt,
		...props
	},
	ref,
) {
	const fillStyle = fill
		? {
				position: "absolute" as const,
				inset: 0,
				width: "100%",
				height: "100%",
			}
		: {};

	return (
		<img
			ref={ref}
			alt={alt ?? ""}
			src={resolveImageSrc(src)}
			style={{ ...fillStyle, ...style }}
			{...props}
		/>
	);
});

export default Image;
