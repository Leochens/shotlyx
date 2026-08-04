import { execFileSync } from "node:child_process";

const LOCAL_PROXY_BYPASS_HOSTS = ["localhost", "127.0.0.1", "::1"];
const PROXY_ENV_PAIRS = [
	["HTTP_PROXY", "http_proxy"],
	["HTTPS_PROXY", "https_proxy"],
	["ALL_PROXY", "all_proxy"],
] as const;

function firstNonBlank({
	env,
	keys,
}: {
	env: NodeJS.ProcessEnv;
	keys: readonly string[];
}): string | undefined {
	for (const key of keys) {
		const value = env[key]?.trim();
		if (value) return value;
	}
	return undefined;
}

function normalizeBypassHost(value: string): string {
	const trimmed = value.trim();
	if (trimmed.startsWith("*.")) return trimmed.slice(1);
	return trimmed;
}

function mergeBypassHosts(...groups: Array<string | undefined>): string {
	const seen = new Set<string>();
	const hosts: string[] = [];
	for (const group of groups) {
		for (const rawHost of group?.split(",") ?? []) {
			const host = normalizeBypassHost(rawHost);
			if (!host || seen.has(host.toLowerCase())) continue;
			seen.add(host.toLowerCase());
			hosts.push(host);
		}
	}
	return hosts.join(",");
}

function buildProxyUrl({
	scheme,
	host,
	port,
}: {
	scheme: "http" | "socks5h";
	host?: string;
	port?: string;
}): string | undefined {
	const normalizedHost = host?.trim();
	const normalizedPort = port?.trim();
	if (!normalizedHost || !/^\d+$/.test(normalizedPort ?? "")) return undefined;
	const urlHost =
		normalizedHost.includes(":") && !normalizedHost.startsWith("[")
			? `[${normalizedHost}]`
			: normalizedHost;
	return `${scheme}://${urlHost}:${normalizedPort}`;
}

function buildProxyUrlFromEndpoint({
	scheme,
	endpoint,
}: {
	scheme: "http" | "socks5h";
	endpoint?: string;
}): string | undefined {
	const normalized = endpoint?.trim();
	if (!normalized) return undefined;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) return normalized;
	const bracketed = normalized.match(/^\[([^\]]+)]:(\d+)$/);
	const plain = normalized.match(/^([^:]+):(\d+)$/);
	const match = bracketed ?? plain;
	if (!match?.[1] || !match[2]) return undefined;
	return buildProxyUrl({ scheme, host: match[1], port: match[2] });
}

function withProxyAliases(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const result = { ...env };
	for (const [upper, lower] of [
		...PROXY_ENV_PAIRS,
		["NO_PROXY", "no_proxy"] as const,
	]) {
		const value = firstNonBlank({ env: result, keys: [upper, lower] });
		if (!value) continue;
		result[upper] = value;
		result[lower] = value;
	}
	return result;
}

export function parseMacOSSystemProxy(output: string): NodeJS.ProcessEnv {
	const values = new Map<string, string>();
	const exceptions: string[] = [];
	let readingExceptions = false;

	for (const rawLine of output.split(/\r?\n/)) {
		if (/^\s*ExceptionsList\s*:\s*<array>\s*\{\s*$/.test(rawLine)) {
			readingExceptions = true;
			continue;
		}
		if (readingExceptions) {
			if (/^\s*\}\s*$/.test(rawLine)) {
				readingExceptions = false;
				continue;
			}
			const exception = rawLine.match(/^\s*\d+\s*:\s*(.*?)\s*$/)?.[1];
			if (exception) exceptions.push(exception);
			continue;
		}

		const entry = rawLine.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*?)\s*$/);
		if (entry?.[1] && entry[2] !== undefined) {
			values.set(entry[1], entry[2]);
		}
	}

	const httpProxy =
		values.get("HTTPEnable") === "1"
			? buildProxyUrl({
					scheme: "http",
					host: values.get("HTTPProxy"),
					port: values.get("HTTPPort"),
				})
			: undefined;
	const httpsProxy =
		values.get("HTTPSEnable") === "1"
			? buildProxyUrl({
					scheme: "http",
					host: values.get("HTTPSProxy"),
					port: values.get("HTTPSPort"),
				})
			: undefined;
	const socksProxy =
		values.get("SOCKSEnable") === "1"
			? buildProxyUrl({
					scheme: "socks5h",
					host: values.get("SOCKSProxy"),
					port: values.get("SOCKSPort"),
				})
			: undefined;

	if (!httpProxy && !httpsProxy && !socksProxy) return {};
	return withProxyAliases({
		...(httpProxy ? { HTTP_PROXY: httpProxy } : {}),
		...(httpsProxy ? { HTTPS_PROXY: httpsProxy } : {}),
		...(socksProxy ? { ALL_PROXY: socksProxy } : {}),
		NO_PROXY: mergeBypassHosts(
			exceptions.join(","),
			LOCAL_PROXY_BYPASS_HOSTS.join(","),
		),
	});
}

export function parseWindowsSystemProxy(output: string): NodeJS.ProcessEnv {
	const values = new Map<string, string>();
	for (const rawLine of output.split(/\r?\n/)) {
		const entry = rawLine.match(
			/^\s*(ProxyEnable|ProxyServer|ProxyOverride)\s+REG_[A-Z_]+\s+(.*?)\s*$/i,
		);
		if (entry?.[1] && entry[2] !== undefined) {
			values.set(entry[1].toLowerCase(), entry[2]);
		}
	}
	if (!/^(?:0x)?1$/i.test(values.get("proxyenable") ?? "")) return {};

	const server = values.get("proxyserver")?.trim();
	if (!server) return {};
	const endpoints = new Map<string, string>();
	if (server.includes("=")) {
		for (const part of server.split(";")) {
			const separatorIndex = part.indexOf("=");
			if (separatorIndex <= 0) continue;
			const protocol = part.slice(0, separatorIndex).trim().toLowerCase();
			const endpoint = part.slice(separatorIndex + 1).trim();
			if (protocol && endpoint) endpoints.set(protocol, endpoint);
		}
	} else {
		endpoints.set("http", server);
		endpoints.set("https", server);
	}

	const httpProxy = buildProxyUrlFromEndpoint({
		scheme: "http",
		endpoint: endpoints.get("http"),
	});
	const httpsProxy = buildProxyUrlFromEndpoint({
		scheme: "http",
		endpoint: endpoints.get("https") ?? endpoints.get("http"),
	});
	const socksProxy = buildProxyUrlFromEndpoint({
		scheme: "socks5h",
		endpoint: endpoints.get("socks") ?? endpoints.get("socks5"),
	});
	if (!httpProxy && !httpsProxy && !socksProxy) return {};

	const overrideHosts = (values.get("proxyoverride") ?? "")
		.split(";")
		.filter((host) => host.trim().toLowerCase() !== "<local>")
		.join(",");
	return withProxyAliases({
		...(httpProxy ? { HTTP_PROXY: httpProxy } : {}),
		...(httpsProxy ? { HTTPS_PROXY: httpsProxy } : {}),
		...(socksProxy ? { ALL_PROXY: socksProxy } : {}),
		NO_PROXY: mergeBypassHosts(
			overrideHosts,
			LOCAL_PROXY_BYPASS_HOSTS.join(","),
		),
	});
}

export function resolveSystemProxyEnvironment({
	platform = process.platform,
	readMacOSProxy = () =>
		execFileSync("/usr/sbin/scutil", ["--proxy"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 1_000,
		}),
	readWindowsProxy = () =>
		execFileSync(
			"reg.exe",
			[
				"query",
				"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
			],
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
				timeout: 1_000,
			},
		),
}: {
	platform?: NodeJS.Platform;
	readMacOSProxy?: () => string;
	readWindowsProxy?: () => string;
} = {}): NodeJS.ProcessEnv {
	try {
		if (platform === "darwin") {
			return parseMacOSSystemProxy(readMacOSProxy());
		}
		if (platform === "win32") {
			return parseWindowsSystemProxy(readWindowsProxy());
		}
		return {};
	} catch {
		return {};
	}
}

export function mergeLocalCliProxyEnvironment({
	explicitEnv,
	systemProxyEnv,
}: {
	explicitEnv: NodeJS.ProcessEnv;
	systemProxyEnv: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
	const merged: NodeJS.ProcessEnv = { ...systemProxyEnv, ...explicitEnv };
	for (const [upper, lower] of PROXY_ENV_PAIRS) {
		const value =
			firstNonBlank({ env: explicitEnv, keys: [upper, lower] }) ??
			firstNonBlank({ env: systemProxyEnv, keys: [upper, lower] });
		if (!value) continue;
		merged[upper] = value;
		merged[lower] = value;
	}
	const explicitNoProxy = firstNonBlank({
		env: explicitEnv,
		keys: ["NO_PROXY", "no_proxy"],
	});
	const systemNoProxy = firstNonBlank({
		env: systemProxyEnv,
		keys: ["NO_PROXY", "no_proxy"],
	});
	const noProxy = mergeBypassHosts(
		explicitNoProxy ?? systemNoProxy,
		LOCAL_PROXY_BYPASS_HOSTS.join(","),
	);
	if (noProxy) {
		merged.NO_PROXY = noProxy;
		merged.no_proxy = noProxy;
	}
	return merged;
}
