/**
 * 流式输出测试脚本
 * 用法: bun run apps/renderer/src/agent/__tests__/stream-test.ts
 *
 * 需要 dev server 运行中 (bun dev:web)
 */

const API_URL = "http://localhost:3000/api/agent/plan";

async function testStreaming() {
	console.log("=== 流式输出测试 ===\n");

	const body = {
		messages: [{ role: "user", content: "帮我把分辨率改成 1920x1080" }],
		toolSchemas: [
			{
				name: "project_update_canvas_size",
				description: "修改项目画布尺寸",
				parameters: {
					width: { type: "number", description: "宽度" },
					height: { type: "number", description: "高度" },
				},
			},
		],
	};

	console.log("1. 测试 SSE 流式请求...\n");

	const startTime = Date.now();
	const chunkTimes: number[] = [];

	try {
		const response = await fetch(API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "text/event-stream",
			},
			body: JSON.stringify(body),
		});

		console.log("   Status:", response.status);
		console.log("   Content-Type:", response.headers.get("content-type"));
		console.log("");

		if (!response.ok) {
			console.error("   请求失败:", await response.text());
			return;
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (!contentType.includes("text/event-stream")) {
			console.error("   错误: 响应不是 SSE 格式，而是:", contentType);
			const data = await response.json();
			console.log("   响应内容:", JSON.stringify(data, null, 2).slice(0, 500));
			return;
		}

		const reader = response.body?.getReader();
		if (!reader) {
			console.error("   错误: 无法获取 response body reader");
			return;
		}

		const decoder = new TextDecoder();
		let buffer = "";
		let eventCount = 0;
		let chunkEvents = 0;
		let planEvent = false;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const elapsed = Date.now() - startTime;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				if (!line.startsWith("data: ")) continue;
				const payload = line.slice(6).trim();
				if (!payload) continue;

				eventCount++;
				chunkTimes.push(elapsed);

				try {
					const event = JSON.parse(payload) as Record<string, unknown>;

					if (event.plan) {
						planEvent = true;
						console.log(`   [${elapsed}ms] 事件 #${eventCount}: 最终 plan (有 ${(event.plan as { steps?: unknown[] }).steps?.length ?? 0} 个步骤)`);
					} else if (typeof event.chunk === "string") {
						chunkEvents++;
						const preview = event.chunk.length > 80
							? event.chunk.slice(0, 80) + "..."
							: event.chunk;
						console.log(`   [${elapsed}ms] 事件 #${eventCount}: chunk (${event.chunk.length} 字符) "${preview}"`);
					} else if (event.error) {
						console.error(`   [${elapsed}ms] 事件 #${eventCount}: 错误 -`, event.error);
					}
				} catch {
					console.log(`   [${elapsed}ms] 事件 #${eventCount}: 解析失败 - ${payload.slice(0, 100)}`);
				}
			}
		}

		const totalTime = Date.now() - startTime;
		console.log("\n=== 结果 ===");
		console.log(`   总耗时: ${totalTime}ms`);
		console.log(`   总事件数: ${eventCount}`);
		console.log(`   chunk 事件数: ${chunkEvents}`);
		console.log(`   plan 事件: ${planEvent ? "有" : "无"}`);

		if (chunkEvents > 1) {
			const intervals = chunkTimes.slice(1).map((t, i) => t - chunkTimes[i]);
			const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
			console.log(`   chunk 平均间隔: ${avgInterval.toFixed(0)}ms`);
			console.log("\n   ✅ 流式输出正常！收到多个 chunk 事件。");
		} else if (chunkEvents === 1) {
			console.log("\n   ⚠️  只收到 1 个 chunk — LLM 可能一次性返回了所有内容。");
		} else {
			console.log("\n   ❌ 没有收到任何 chunk 事件 — 流式输出未生效。");
		}
	} catch (err) {
		console.error("   请求异常:", err);
	}

	console.log("\n\n2. 对比：非流式请求...\n");

	try {
		const start2 = Date.now();
		const response2 = await fetch(API_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const data = await response2.json();
		const elapsed2 = Date.now() - start2;
		console.log(`   非流式耗时: ${elapsed2}ms`);
		console.log(`   响应有 plan: ${!!(data as Record<string, unknown>).plan}`);
	} catch (err) {
		console.error("   非流式请求失败:", err);
	}
}

testStreaming();
