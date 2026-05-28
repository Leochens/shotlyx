import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import wasm from "vite-plugin-wasm";

const sourceDir = path.resolve(__dirname, "src");
const platformDir = path.resolve(sourceDir, "platform");

function desktopApiDevServer(): Plugin {
	return {
		name: "shotlyx-desktop-api-dev-server",
		apply: "serve",
		configureServer(server) {
			if (process.env.SHOTLYX_DESKTOP !== "1") return;

			server.middlewares.use(async (request, response, next) => {
				if (!request.url?.startsWith("/api/")) {
					next();
					return;
				}

				const origin = `http://${request.headers.host ?? "127.0.0.1"}`;
				const url = new URL(request.url, origin);
				const headers = new Headers();
				for (const [key, value] of Object.entries(request.headers)) {
					if (Array.isArray(value)) {
						headers.set(key, value.join(", "));
					} else if (value !== undefined) {
						headers.set(key, value);
					}
				}

				const chunks: Buffer[] = [];
				for await (const chunk of request) {
					chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
				}

				const method = request.method ?? "GET";
				const apiRequest = new Request(url, {
					method,
					headers,
					body:
						method === "GET" || method === "HEAD"
							? undefined
							: Buffer.concat(chunks),
				});

				const module = await server.ssrLoadModule("/src/electron-api/handler.ts");
				const apiResponse = await module.handleElectronApiRequest(apiRequest);

				response.statusCode = apiResponse.status;
				apiResponse.headers.forEach((value, key) => {
					response.setHeader(key, value);
				});

				if (!apiResponse.body) {
					response.end();
					return;
				}

				const reader = apiResponse.body.getReader();
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					response.write(Buffer.from(value));
				}
				response.end();
			});
		},
	};
}

export default defineConfig(({ mode }) => ({
	plugins: [desktopApiDevServer(), wasm(), react()],
	resolve: {
		alias: {
			"@": sourceDir,
			bufferutil: path.join(platformDir, "optional-native-empty.ts"),
			"content-collections": path.resolve(
				__dirname,
				".content-collections/generated/index.js",
			),
			"opencut-wasm": path.resolve(
				__dirname,
				"../../rust/wasm/pkg/opencut_wasm.js",
			),
			"utf-8-validate": path.join(platformDir, "optional-native-empty.ts"),
		},
	},
	define: {
		"process.env.NODE_ENV": JSON.stringify(mode),
		"process.env.VITE_REACT_SCAN": JSON.stringify(
			process.env.VITE_REACT_SCAN ?? "false",
		),
		"process.env.VITE_SHOTLYX_DESKTOP": JSON.stringify("1"),
		"process.env.VITE_SHOTLYX_API_ORIGIN": JSON.stringify(
			process.env.VITE_SHOTLYX_API_ORIGIN ?? "",
		),
		"process.env.VITE_SITE_URL": JSON.stringify(
			process.env.VITE_SITE_URL ??
				process.env.SHOTLYX_RENDERER_ORIGIN ??
				"app://shotlyx",
		),
		"process.env.VITE_MARBLE_API_URL": JSON.stringify(
			process.env.VITE_MARBLE_API_URL ??
				process.env.SHOTLYX_RENDERER_ORIGIN ??
				"app://shotlyx",
		),
	},
	server: {
		host: "127.0.0.1",
		port: 5173,
		strictPort: false,
	},
	preview: {
		host: "127.0.0.1",
		port: 4173,
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		sourcemap: true,
	},
}));
