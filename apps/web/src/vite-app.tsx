import { useEffect } from "react";
import "./app/globals.css";
import EditorPage from "./app/editor/[project_id]/page";
import ProjectsPage from "./app/projects/page";
import SettingsPage from "./app/settings/page";
import SettingsApiPage from "./app/settings/api/page";
import { ThemeProvider } from "./platform/next-themes";
import {
	ShotlyxRouterProvider,
	useRouter,
	useShotlyxRouter,
} from "./platform/router";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

function DesktopRedirect() {
	const router = useRouter();

	useEffect(() => {
		router.replace("/settings/api");
	}, [router]);

	return (
		<div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
			Opening Shotlyx setup...
		</div>
	);
}

function NotFoundRoute() {
	const router = useRouter();

	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
			<h1 className="text-2xl font-semibold">Page not found</h1>
			<button
				className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
				onClick={() => router.replace("/projects")}
				type="button"
			>
				Back to projects
			</button>
		</main>
	);
}

function RouteSwitch() {
	const { route } = useShotlyxRouter();

	if (route.kind === "desktop") return <DesktopRedirect />;
	if (route.kind === "settings") return <SettingsPage />;
	if (route.kind === "settings-api") return <SettingsApiPage />;
	if (route.kind === "editor") return <EditorPage />;
	if (route.kind === "not-found") return <NotFoundRoute />;
	return <ProjectsPage />;
}

function AppProviders() {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			disableTransitionOnChange={true}
		>
			<TooltipProvider>
				<Toaster />
				<RouteSwitch />
			</TooltipProvider>
		</ThemeProvider>
	);
}

export function ViteShotlyxApp() {
	return (
		<ShotlyxRouterProvider>
			<AppProviders />
		</ShotlyxRouterProvider>
	);
}
