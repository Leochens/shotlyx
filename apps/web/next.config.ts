import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withContentCollections } from "@content-collections/next";

const desktopDistDir = process.env.SHOTLYX_DESKTOP_DIST_DIR;

const nextConfig: NextConfig = {
	...(desktopDistDir ? { distDir: desktopDistDir } : {}),
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	serverExternalPackages: ["esbuild"],
	reactStrictMode: true,
	productionBrowserSourceMaps: true,
	output: "standalone",
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
			{
				protocol: "https",
				hostname: "cdn.brandfetch.io",
			},
		],
	},
};

export default withContentCollections(withBotId(nextConfig));
