import { describe, expect, test } from "bun:test";
import {
	mergeLocalCliProxyEnvironment,
	parseMacOSSystemProxy,
	parseWindowsSystemProxy,
	resolveSystemProxyEnvironment,
} from "../system-proxy";

const MACOS_PROXY_OUTPUT = `<dictionary> {
  ExceptionsList : <array> {
    0 : 127.0.0.1
    1 : localhost
    2 : *.local
  }
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
  SOCKSEnable : 1
  SOCKSPort : 7891
  SOCKSProxy : 127.0.0.1
}`;

describe("local CLI system proxy", () => {
	test("converts macOS HTTP, HTTPS, and SOCKS settings into CLI proxy env", () => {
		const env = parseMacOSSystemProxy(MACOS_PROXY_OUTPUT);

		expect(env.HTTP_PROXY).toBe("http://127.0.0.1:7890");
		expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
		expect(env.ALL_PROXY).toBe("socks5h://127.0.0.1:7891");
		expect(env.http_proxy).toBe(env.HTTP_PROXY);
		expect(env.https_proxy).toBe(env.HTTPS_PROXY);
		expect(env.all_proxy).toBe(env.ALL_PROXY);
		expect(env.NO_PROXY).toContain(".local");
		expect(env.NO_PROXY).toContain("::1");
		expect(env.no_proxy).toBe(env.NO_PROXY);
	});

	test("does not create proxy env when the system proxies are disabled", () => {
		expect(
			parseMacOSSystemProxy(`<dictionary> {
  HTTPEnable : 0
  HTTPProxy : 127.0.0.1
  HTTPPort : 7890
}`),
		).toEqual({});
	});

	test("converts Windows registry proxy settings into CLI proxy env", () => {
		const env = parseWindowsSystemProxy(`
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ       http=127.0.0.1:7890;https=127.0.0.1:7890;socks=127.0.0.1:7891
    ProxyOverride  REG_SZ       <local>;localhost;*.local
`);

		expect(env.HTTP_PROXY).toBe("http://127.0.0.1:7890");
		expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
		expect(env.ALL_PROXY).toBe("socks5h://127.0.0.1:7891");
		expect(env.NO_PROXY).toContain(".local");
	});

	test("keeps explicit proxy values ahead of discovered system values", () => {
		const env = mergeLocalCliProxyEnvironment({
			explicitEnv: {
				HTTPS_PROXY: "http://explicit-proxy:8080",
				no_proxy: "internal.example.com",
			},
			systemProxyEnv: parseMacOSSystemProxy(MACOS_PROXY_OUTPUT),
		});

		expect(env.HTTPS_PROXY).toBe("http://explicit-proxy:8080");
		expect(env.https_proxy).toBe("http://explicit-proxy:8080");
		expect(env.HTTP_PROXY).toBe("http://127.0.0.1:7890");
		expect(env.NO_PROXY).toContain("internal.example.com");
		expect(env.NO_PROXY).toContain("localhost");
		expect(env.NO_PROXY).not.toContain(".local");
	});

	test("fails closed when system proxy discovery is unavailable", () => {
		expect(
			resolveSystemProxyEnvironment({
				platform: "darwin",
				readMacOSProxy: () => {
					throw new Error("scutil unavailable");
				},
			}),
		).toEqual({});
		expect(
			resolveSystemProxyEnvironment({
				platform: "win32",
				readWindowsProxy: () => {
					throw new Error("registry unavailable");
				},
			}),
		).toEqual({});
	});
});
