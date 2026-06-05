import { createServerApp } from "./http";

const port = Number(process.env.PORT ?? 8787);
const app = createServerApp();

Bun.serve({
	port,
	fetch: app.fetch,
});

console.log(`Shotlyx server listening on http://127.0.0.1:${port}`);
