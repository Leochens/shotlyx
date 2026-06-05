import path from "node:path";
import { defineConfig } from "vite";

const sourceDir = path.resolve(__dirname, "src");
const platformDir = path.resolve(sourceDir, "platform");
const desktopApiExternals = [
	"@remotion/bundler",
	"@remotion/renderer",
	"electron",
	"esbuild",
];

export default defineConfig({
	publicDir: false,
	resolve: {
		alias: {
			"@": sourceDir,
			bufferutil: path.join(platformDir, "optional-native-empty.ts"),
			"utf-8-validate": path.join(platformDir, "optional-native-empty.ts"),
		},
	},
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
		"process.env.VITE_SHOTLYX_DESKTOP": JSON.stringify("1"),
		"process.env.VITE_SHOTLYX_API_ORIGIN": JSON.stringify(
			process.env.VITE_SHOTLYX_API_ORIGIN ?? "app://shotlyx",
		),
		"process.env.VITE_SITE_URL": JSON.stringify(
			process.env.VITE_SITE_URL ?? "https://shotlyx.ai",
		),
		"process.env.VITE_SHOTLYX_SERVER_URL": JSON.stringify(
			process.env.VITE_SHOTLYX_SERVER_URL ?? "https://api.shotlyx.ai",
		),
		"process.env.VITE_MARBLE_API_URL": JSON.stringify(
			process.env.VITE_MARBLE_API_URL ?? "app://shotlyx",
		),
	},
	ssr: {
		external: desktopApiExternals,
		noExternal: true,
	},
	build: {
		ssr: "src/electron-api/handler.ts",
		outDir: "dist-electron",
		emptyOutDir: true,
		sourcemap: true,
		target: "node20",
		rollupOptions: {
			external: desktopApiExternals,
			output: {
				entryFileNames: "desktop-api.mjs",
				format: "es",
			},
		},
	},
});
