import { useEffect, useRef, useState, type ReactNode } from "react";
import "./app/globals.css";
import HomePage from "./app/page";
import BlogPage from "./app/blog/page";
import BlogPostPage from "./app/blog/[slug]/page";
import BrandPage from "./app/brand/page";
import ChangelogPage from "./app/changelog/page";
import ChangelogDetailPage from "./app/changelog/[version]/page";
import ContributorsPage from "./app/contributors/page";
import EditorPage from "./app/editor/[project_id]/page";
import LicensePage from "./app/license/page";
import LoginPage from "./app/login/page";
import PrivacyPage from "./app/privacy/page";
import ProjectsPage from "./app/projects/page";
import RoadmapPage from "./app/roadmap/page";
import SettingsPage from "./app/settings/page";
import SettingsApiPage from "./app/settings/api/page";
import SourcePage from "./app/source/page";
import SponsorsPage from "./app/sponsors/page";
import TermsPage from "./app/terms/page";
import ThirdPartyNoticesPage from "./app/third-party-notices/page";
import { ThemeProvider } from "./platform/theme";
import {
	ShotlyxRouterProvider,
	isRouteNotFoundError,
	useRouter,
	useShotlyxRouter,
} from "./platform/router";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

type DesktopConfigStatusGroup = {
	configured: boolean;
	required: boolean;
};

function hasRequiredDesktopStatus(status: DesktopConfigStatusGroup[]): boolean {
	const requiredGroups = status.filter((group) => group.required);
	return (
		requiredGroups.length > 0 &&
		requiredGroups.every((group) => group.configured)
	);
}

function isDesktopConfigStatusGroup(
	value: unknown,
): value is DesktopConfigStatusGroup {
	if (typeof value !== "object" || value === null) return false;
	return (
		typeof Reflect.get(value, "configured") === "boolean" &&
		typeof Reflect.get(value, "required") === "boolean"
	);
}

function getDesktopStatusFromResponse(
	response: unknown,
): DesktopConfigStatusGroup[] {
	if (typeof response !== "object" || response === null) return [];
	const status = Reflect.get(response, "status");
	return Array.isArray(status) ? status.filter(isDesktopConfigStatusGroup) : [];
}

function DesktopRedirect() {
	useEffect(() => {
		let cancelled = false;

		async function redirectForDesktopConfig() {
			try {
				const response = await fetch("/api/desktop/config", {
					cache: "no-store",
				});
				if (!response.ok) {
					throw new Error(`Desktop config request failed: ${response.status}`);
				}
				const status = getDesktopStatusFromResponse(await response.json());
				const target = hasRequiredDesktopStatus(status)
					? "/projects"
					: "/settings/api";
				if (!cancelled) {
					window.location.replace(target);
				}
			} catch {
				if (!cancelled) {
					window.location.replace("/settings/api");
				}
			}
		}

		void redirectForDesktopConfig();
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
			Opening Shotlyx Desktop...
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

function AsyncRoute({
	routeKey,
	render,
}: {
	routeKey: string;
	render: () => ReactNode | Promise<ReactNode>;
}) {
	const renderRef = useRef(render);
	const [state, setState] = useState<
		| { routeKey: string; status: "loading" }
		| { routeKey: string; status: "ready"; node: ReactNode }
		| { routeKey: string; status: "not-found" }
		| { routeKey: string; status: "error"; message: string }
	>({ routeKey, status: "loading" });

	useEffect(() => {
		renderRef.current = render;
	}, [render]);

	useEffect(() => {
		let cancelled = false;
		Promise.resolve(renderRef.current())
			.then((node) => {
				if (!cancelled) setState({ routeKey, status: "ready", node });
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				if (isRouteNotFoundError(error)) {
					setState({ routeKey, status: "not-found" });
					return;
				}
				setState({
					routeKey,
					status: "error",
					message: error instanceof Error ? error.message : String(error),
				});
			});
		return () => {
			cancelled = true;
		};
	}, [routeKey]);

	if (state.routeKey !== routeKey) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
				Loading...
			</div>
		);
	}
	if (state.status === "ready") return state.node;
	if (state.status === "not-found") return <NotFoundRoute />;
	if (state.status === "error") {
		return (
			<main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
				<h1 className="text-2xl font-semibold">Page failed to load</h1>
				<p className="max-w-lg text-muted-foreground text-sm">
					{state.message}
				</p>
			</main>
		);
	}
	return (
		<div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
			Loading...
		</div>
	);
}

function RouteSwitch() {
	const { route } = useShotlyxRouter();
	const routeKey = `${route.pathname}${route.search}`;

	if (route.kind === "home") return <HomePage />;
	if (route.kind === "desktop") return <DesktopRedirect />;
	if (route.kind === "settings") return <SettingsPage />;
	if (route.kind === "settings-api") return <SettingsApiPage />;
	if (route.kind === "editor") return <EditorPage />;
	if (route.kind === "blog") {
		return <AsyncRoute routeKey={routeKey} render={() => BlogPage()} />;
	}
	if (route.kind === "blog-post") {
		return (
			<AsyncRoute
				routeKey={routeKey}
				render={() =>
					BlogPostPage({
						params: Promise.resolve({ slug: route.params.slug ?? "" }),
						searchParams: Promise.resolve({}),
					})
				}
			/>
		);
	}
	if (route.kind === "brand") return <BrandPage />;
	if (route.kind === "changelog") return <ChangelogPage />;
	if (route.kind === "changelog-detail") {
		return (
			<AsyncRoute
				routeKey={routeKey}
				render={() =>
					ChangelogDetailPage({
						params: Promise.resolve({ version: route.params.version ?? "" }),
					})
				}
			/>
		);
	}
	if (route.kind === "contributors") {
		return <AsyncRoute routeKey={routeKey} render={() => ContributorsPage()} />;
	}
	if (route.kind === "license") return <LicensePage />;
	if (route.kind === "login") return <LoginPage />;
	if (route.kind === "privacy") return <PrivacyPage />;
	if (route.kind === "roadmap") return <RoadmapPage />;
	if (route.kind === "source") return <SourcePage />;
	if (route.kind === "sponsors") return <SponsorsPage />;
	if (route.kind === "terms") return <TermsPage />;
	if (route.kind === "third-party-notices") return <ThirdPartyNoticesPage />;
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
