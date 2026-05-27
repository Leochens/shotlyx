import { redirect } from "next/navigation";
import {
	applyDesktopConfigToProcessEnv,
	hasRequiredDesktopConfig,
	isDesktopMode,
	readDesktopApiConfig,
} from "@/desktop/config/server";

export const dynamic = "force-dynamic";

export default function DesktopHomePage() {
	if (!isDesktopMode()) {
		redirect("/settings/api");
	}

	applyDesktopConfigToProcessEnv();
	const config = readDesktopApiConfig();
	redirect(hasRequiredDesktopConfig(config.values) ? "/projects" : "/settings/api");
}
