"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
	ArrowLeft,
	CheckCircle2,
	CircleAlert,
	ExternalLink,
	Save,
	Settings,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
	DESKTOP_API_GROUPS,
	type DesktopApiGroup,
	isSecretDesktopApiField,
} from "@/desktop/config/catalog";
import { PRODUCT_NAME } from "@/site/brand";
import { ShotlyxLogo } from "@/components/brand-logo";

type StatusGroup = {
	id: string;
	title: string;
	configured: boolean;
	required: boolean;
	fields: Array<{
		key: string;
		label: string;
		configured: boolean;
		secret: boolean;
	}>;
};

type ConfigResponse = {
	desktop: boolean;
	configPath?: string;
	updatedAt?: string;
	groups: DesktopApiGroup[];
	values: Record<string, string>;
	status: StatusGroup[];
	error?: string;
};

function isConfigResponse(value: unknown): value is ConfigResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		"desktop" in value &&
		"groups" in value &&
		"values" in value &&
		"status" in value &&
		Array.isArray(value.groups) &&
		Array.isArray(value.status) &&
		typeof value.values === "object" &&
		value.values !== null
	);
}

async function readConfigResponse(response: Response): Promise<ConfigResponse> {
	const data: unknown = await response.json();
	if (!isConfigResponse(data)) {
		throw new Error("Invalid desktop config response");
	}
	return data;
}

function readErrorMessage(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null || !("error" in value)) {
		return undefined;
	}
	const error = value.error;
	return typeof error === "string" ? error : undefined;
}

function getInitialValues(groups: DesktopApiGroup[]) {
	return Object.fromEntries(
		groups.flatMap((group) =>
			group.fields.map((field) => [
				field.key,
				field.secret ? "" : (field.defaultValue ?? ""),
			]),
		),
	) as Record<string, string>;
}

function mergeResponseValues({
	groups,
	values,
}: {
	groups: DesktopApiGroup[];
	values: Record<string, string>;
}) {
	return Object.fromEntries(
		groups.flatMap((group) =>
			group.fields.map((field) => [
				field.key,
				field.secret ? "" : values[field.key] || field.defaultValue || "",
			]),
		),
	) as Record<string, string>;
}

export default function DesktopApiSettingsPage() {
	const [groups, setGroups] = useState<DesktopApiGroup[]>(DESKTOP_API_GROUPS);
	const [values, setValues] = useState<Record<string, string>>(() =>
		getInitialValues(DESKTOP_API_GROUPS),
	);
	const [status, setStatus] = useState<StatusGroup[]>([]);
	const [configPath, setConfigPath] = useState<string | null>(null);
	const [isDesktop, setDesktop] = useState(true);
	const [isLoading, setLoading] = useState(true);
	const [isSaving, setSaving] = useState(false);

	const requiredReady = useMemo(() => {
		const requiredGroups = status.filter((group) => group.required);
		return (
			!isLoading &&
			requiredGroups.length > 0 &&
			requiredGroups.every((group) => group.configured)
		);
	}, [isLoading, status]);

	useEffect(() => {
		let cancelled = false;
		async function loadConfig() {
			setLoading(true);
			try {
				const response = await fetch("/api/desktop/config", {
					cache: "no-store",
				});
				if (!response.ok) {
					if (cancelled) return;
					setDesktop(false);
					toast.error("Desktop local mode is not active");
					return;
				}
				const data = await readConfigResponse(response);
				if (cancelled) return;
				setDesktop(data.desktop);
				setGroups(data.groups);
				setStatus(data.status);
				setConfigPath(data.configPath ?? null);
				setValues(
					mergeResponseValues({
						groups: data.groups,
						values: data.values ?? {},
					}),
				);
			} catch (error) {
				if (!cancelled) {
					toast.error("Failed to load desktop API settings", {
						description:
							error instanceof Error ? error.message : "Unknown error",
					});
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		loadConfig();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleSave = async () => {
		setSaving(true);
		try {
			const payloadValues = Object.fromEntries(
				Object.entries(values).filter(([key, value]) => {
					if (isSecretDesktopApiField(key)) return value.trim().length > 0;
					return true;
				}),
			);
			const response = await fetch("/api/desktop/config", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ values: payloadValues }),
			});
			if (!response.ok) {
				const data: unknown = await response.json();
				throw new Error(readErrorMessage(data) ?? "Failed to save settings");
			}
			const data = await readConfigResponse(response);
			setGroups(data.groups);
			setStatus(data.status);
			setConfigPath(data.configPath ?? null);
			setValues(
				mergeResponseValues({
					groups: data.groups,
					values: data.values ?? {},
				}),
			);
			toast.success("API settings saved", {
				description: "The local Agent server can use the new values now.",
			});
		} catch (error) {
			toast.error("Failed to save API settings", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setSaving(false);
		}
	};

	return (
		<main className="min-h-screen bg-background text-foreground">
			<header className="sticky top-0 z-20 border-b bg-background/95 px-6 backdrop-blur">
				<div className="mx-auto flex h-16 max-w-7xl items-center justify-between">
					<div className="flex items-center gap-3">
						<Button asChild variant="ghost" size="icon">
							<Link href="/desktop" aria-label="Back to desktop home">
								<ArrowLeft className="size-4" />
							</Link>
						</Button>
						<ShotlyxLogo size={30} alt="" />
						<div>
							<p className="text-xs text-muted-foreground">
								{PRODUCT_NAME} Desktop
							</p>
							<h1 className="text-base font-semibold">API settings</h1>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Badge
							variant={
								isLoading
									? "outline"
									: requiredReady
										? "secondary"
										: "destructive"
							}
						>
							{isLoading
								? "Loading..."
								: requiredReady
									? "Ready"
									: "Agent API required"}
						</Badge>
						<Button onClick={handleSave} disabled={isSaving || isLoading}>
							<Save className="size-4" />
							{isSaving ? "Saving..." : "Save"}
						</Button>
					</div>
				</div>
			</header>

			<div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[19rem_1fr]">
				<aside className="flex flex-col gap-4">
					<section className="rounded-md border bg-[#f6fbfc] p-4 dark:bg-[#050607]">
						<div className="mb-3 flex items-center gap-2">
							<Settings className="size-4" />
							<h2 className="text-sm font-medium">Why this is required</h2>
						</div>
						<p className="text-sm leading-6 text-muted-foreground">
							Shotlyx Agent, Prompt operations, task generation, video
							generation, voiceover, transcription, web search, and stock media
							call provider APIs from the local server. Configure keys here so
							the server can use them immediately.
						</p>
						<Separator className="my-4" />
						<div className="space-y-2 text-xs text-muted-foreground">
							<p>
								How to configure: choose a provider, create an API key on the
								recommended site, paste the key, then Save.
							</p>
							<p>
								Storage: keys are written to a local desktop config file, not to
								browser localStorage.
							</p>
							{configPath && (
								<p className="break-all">Local config: {configPath}</p>
							)}
						</div>
					</section>

					<section className="rounded-md border p-4">
						<h2 className="mb-3 text-sm font-medium">Status</h2>
						<ul className="space-y-2">
							{status.map((group) => (
								<li
									key={group.id}
									className="flex items-center justify-between gap-2 text-sm"
								>
									<span className="truncate">{group.title}</span>
									<span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
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
					</section>

					{!isDesktop && (
						<section className="rounded-md border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-200">
							Start with <code>bun run dev:client</code> to enable this local
							settings API.
						</section>
					)}
				</aside>

				<div className="flex flex-col gap-4">
					{groups.map((group) => {
						const groupStatus = status.find((item) => item.id === group.id);
						return (
							<section
								key={group.id}
								className="rounded-md border bg-background p-5"
							>
								<div className="mb-5 flex flex-wrap items-start justify-between gap-3">
									<div className="max-w-2xl">
										<div className="mb-2 flex items-center gap-2">
											<h2 className="text-lg font-semibold tracking-normal">
												{group.title}
											</h2>
											{groupStatus?.required && (
												<Badge variant="destructive">Required</Badge>
											)}
										</div>
										<p className="text-sm leading-6 text-muted-foreground">
											{group.purpose}
										</p>
										<p className="mt-1 text-xs text-muted-foreground">
											Recommended: {group.recommendedProvider}
										</p>
									</div>
									<Badge
										variant={groupStatus?.configured ? "secondary" : "outline"}
									>
										{groupStatus?.configured ? "Configured" : "Needs key"}
									</Badge>
								</div>

								<div className="grid gap-4 md:grid-cols-2">
									{group.fields.map((field) => {
										const saved = groupStatus?.fields.find(
											(item) => item.key === field.key,
										)?.configured;
										return (
											<div key={field.key} className="flex flex-col gap-2">
												<div className="flex items-center justify-between gap-2">
													<Label htmlFor={field.key}>{field.label}</Label>
													<a
														href={field.applyUrl}
														target="_blank"
														rel="noopener noreferrer"
														className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-500"
													>
														Apply
														<ExternalLink className="size-3" />
													</a>
												</div>
												<Input
													id={field.key}
													name={field.key}
													type={field.secret ? "password" : "text"}
													placeholder={
														field.secret && saved
															? "Saved locally. Enter a new value to replace."
															: field.placeholder
													}
													value={values[field.key] ?? ""}
													disabled={isLoading || isSaving}
													onChange={(event) =>
														setValues((current) => ({
															...current,
															[field.key]: event.target.value,
														}))
													}
													autoComplete="off"
												/>
												<p className="text-xs leading-5 text-muted-foreground">
													{field.help}
													<span className="ml-1 font-mono text-[0.7rem]">
														{field.env}
													</span>
												</p>
											</div>
										);
									})}
								</div>
							</section>
						);
					})}
				</div>
			</div>
		</main>
	);
}
