import { useEffect } from "react";

type ScriptProps = {
	src?: string;
	id?: string;
	strategy?: "beforeInteractive" | "afterInteractive" | "lazyOnload" | "worker";
	children?: string;
	async?: boolean;
	crossOrigin?: string;
	[key: string]: unknown;
};

export default function Script({
	src,
	id,
	children,
	strategy: _strategy,
	...attributes
}: ScriptProps) {
	useEffect(() => {
		if (!src && !children) return;
		const script = document.createElement("script");
		if (id) script.id = id;
		if (src) script.src = src;
		if (children) script.textContent = children;
		for (const [key, value] of Object.entries(attributes)) {
			if (typeof value === "boolean") {
				if (value) script.setAttribute(key, "");
				continue;
			}
			if (value !== undefined && value !== null) {
				script.setAttribute(key, String(value));
			}
		}
		document.head.append(script);
		return () => {
			script.remove();
		};
	}, [attributes, children, id, src]);

	return null;
}
