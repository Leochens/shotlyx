import { SITE_URL } from "@/site/brand";
import { getPosts } from "@/blog/query";
import type { SitemapMetadata } from "@/platform/metadata";

export default async function sitemap(): Promise<SitemapMetadata> {
	const data = await getPosts();

	const postPages: SitemapMetadata =
		data?.posts?.map((post) => ({
			url: `${SITE_URL}/blog/${post.slug}`,
			lastModified: new Date(post.publishedAt),
			changeFrequency: "weekly",
			priority: 0.8,
		})) ?? [];

	return [
		{
			url: SITE_URL,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 1,
		},
		{
			url: `${SITE_URL}/contributors`,
			lastModified: new Date(),
			changeFrequency: "daily",
			priority: 0.5,
		},
		{
			url: `${SITE_URL}/roadmap`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 1,
		},
		{
			url: `${SITE_URL}/privacy`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.5,
		},
		{
			url: `${SITE_URL}/terms`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.5,
		},
		{
			url: `${SITE_URL}/why-not-capcut`,
			lastModified: new Date(),
			changeFrequency: "yearly",
			priority: 1,
		},
		{
			url: `${SITE_URL}/blog`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 1,
		},
		...postPages,
	];
}
