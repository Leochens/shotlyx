import { describe, expect, test } from "bun:test";
import { mapAuthErrorMessage } from "./client";

describe("auth client errors", () => {
	test("maps server error codes to readable messages", () => {
		expect(mapAuthErrorMessage("password_too_short")).toBe("密码至少需要 6 位");
		expect(mapAuthErrorMessage("invalid_email_or_password")).toBe(
			"邮箱或密码不正确",
		);
		expect(mapAuthErrorMessage("email_already_registered")).toBe(
			"这个邮箱已经注册过了",
		);
	});

	test("keeps unknown errors readable", () => {
		expect(mapAuthErrorMessage("upstream_down")).toBe("upstream_down");
		expect(mapAuthErrorMessage("", "认证失败")).toBe("认证失败");
	});
});
