import type { RobotsMetadata } from "@/platform/metadata";
import { SITE_URL } from "@/site/brand";

export default function robots(): RobotsMetadata {
	return {
		rules: {
			userAgent: "*",
			allow: "/",
			disallow: ["/_next/", "/projects/", "/editor/"],
		},
		sitemap: `${SITE_URL}/sitemap.xml`,
	};
}
