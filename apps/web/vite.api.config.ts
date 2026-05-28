import path from "node:path";
import { defineConfig } from "vite";

const sourceDir = path.resolve(__dirname, "src");
const platformDir = path.resolve(sourceDir, "platform");

export default defineConfig({
	publicDir: false,
	resolve: {
		alias: {
			"@": sourceDir,
			bufferutil: path.join(platformDir, "optional-native-empty.ts"),
			"next/server": path.join(platformDir, "next-server.ts"),
			"utf-8-validate": path.join(platformDir, "optional-native-empty.ts"),
		},
	},
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
		"process.env.NEXT_PUBLIC_SHOTLYX_DESKTOP": JSON.stringify("1"),
		"process.env.NEXT_PUBLIC_SHOTLYX_API_ORIGIN": JSON.stringify(
			process.env.NEXT_PUBLIC_SHOTLYX_API_ORIGIN ?? "app://shotlyx",
		),
		"process.env.NEXT_PUBLIC_SITE_URL": JSON.stringify(
			process.env.NEXT_PUBLIC_SITE_URL ?? "app://shotlyx",
		),
		"process.env.NEXT_PUBLIC_MARBLE_API_URL": JSON.stringify(
			process.env.NEXT_PUBLIC_MARBLE_API_URL ?? "app://shotlyx",
		),
	},
	ssr: {
		noExternal: true,
	},
	build: {
		ssr: "src/electron-api/handler.ts",
		outDir: "dist-electron",
		emptyOutDir: true,
		sourcemap: true,
		target: "node20",
		rollupOptions: {
			output: {
				entryFileNames: "desktop-api.mjs",
				format: "es",
			},
		},
	},
});
