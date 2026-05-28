import type { PageMetadata } from "@/platform/metadata";
import { LoginPageShell } from "@/components/auth/login-page-shell";
import { SITE_INFO } from "@/site/brand";

export const metadata: PageMetadata = {
	title: `Login - ${SITE_INFO.title}`,
	description: `Access the ${SITE_INFO.title} AI video workspace.`,
};

export default function LoginPage() {
	return <LoginPageShell />;
}
