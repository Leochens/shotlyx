export type PageMetadata = {
	metadataBase?: URL;
	title?: string | { default?: string; template?: string };
	description?: string;
	alternates?: Record<string, unknown>;
	openGraph?: Record<string, unknown>;
	twitter?: Record<string, unknown>;
	pinterest?: Record<string, unknown>;
	robots?: Record<string, unknown>;
	icons?: Record<string, unknown>;
	appleWebApp?: Record<string, unknown>;
	manifest?: string;
	other?: Record<string, string>;
};

export type RobotsMetadata = {
	rules: {
		userAgent: string;
		allow?: string | string[];
		disallow?: string | string[];
	};
	sitemap?: string | string[];
};

export type SitemapEntry = {
	url: string;
	lastModified?: Date | string;
	changeFrequency?:
		| "always"
		| "hourly"
		| "daily"
		| "weekly"
		| "monthly"
		| "yearly"
		| "never";
	priority?: number;
};

export type SitemapMetadata = SitemapEntry[];
