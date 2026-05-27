import Link from "next/link";
import { CheckCircle2, CircleAlert, Settings, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	getDesktopConfigStatus,
	isDesktopMode,
	readDesktopApiConfig,
} from "@/desktop/config/server";
import { PRODUCT_NAME } from "@/site/brand";
import { ShotlyxLogo } from "@/components/brand-logo";

export const dynamic = "force-dynamic";

export default function DesktopHomePage() {
	const config = readDesktopApiConfig();
	const status = getDesktopConfigStatus(config.values);
	const requiredReady = status
		.filter((group) => group.required)
		.every((group) => group.configured);
	const configuredCount = status.filter((group) => group.configured).length;

	return (
		<main className="min-h-screen bg-background text-foreground">
			<section className="border-b bg-[#f6fbfc] px-6 py-8 dark:bg-[#050607]">
				<div className="mx-auto flex max-w-6xl flex-col gap-7">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div className="flex items-center gap-3">
							<ShotlyxLogo
								size={40}
								alt=""
								className="drop-shadow-[0_0_18px_rgba(34,211,238,0.22)]"
							/>
							<div>
								<p className="text-sm text-muted-foreground">
									{PRODUCT_NAME} Desktop
								</p>
								<h1 className="text-3xl font-semibold tracking-normal">
									Local API setup
								</h1>
							</div>
						</div>
						<Badge variant={requiredReady ? "secondary" : "destructive"}>
							{requiredReady ? "Ready for Agent" : "API setup required"}
						</Badge>
					</div>

					<div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
						<div className="flex flex-col gap-3">
							<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
								Before using Prompt operations, task generation, video
								generation, voiceover, transcription, or web search, configure
								your own provider API keys. Desktop mode stores the values on
								this computer and the local server reads them directly, so the
								keys are not kept in browser localStorage.
							</p>
							<div className="flex flex-wrap gap-3">
								<Button asChild>
									<Link href="/settings/api">
										<Settings className="size-4" />
										Configure APIs
									</Link>
								</Button>
								<Button asChild variant="secondary">
									<Link href="/projects">
										<Video className="size-4" />
										Open projects
									</Link>
								</Button>
							</div>
						</div>

						<div className="rounded-md border bg-background p-4">
							<div className="mb-3 flex items-center justify-between">
								<h2 className="text-sm font-medium">Configuration status</h2>
								<span className="text-xs text-muted-foreground">
									{configuredCount}/{status.length} groups
								</span>
							</div>
							<ul className="space-y-2">
								{status.map((group) => (
									<li
										key={group.id}
										className="flex items-center justify-between gap-3 text-sm"
									>
										<span className="truncate">{group.title}</span>
										<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
											{group.configured ? (
												<CheckCircle2 className="size-3.5 text-emerald-500" />
											) : (
												<CircleAlert className="size-3.5 text-amber-500" />
											)}
											{group.configured
												? "Configured"
												: group.required
													? "Required"
													: "Optional"}
										</span>
									</li>
								))}
							</ul>
						</div>
					</div>

					{!isDesktopMode() && (
						<div className="rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
							This page is running outside desktop mode. Start with
							<code className="mx-1 rounded bg-background px-1.5 py-0.5">
								bun run dev:client
							</code>
							to enable local API configuration.
						</div>
					)}
				</div>
			</section>
		</main>
	);
}
