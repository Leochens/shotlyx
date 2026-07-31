"use client";

import { useEffect, useState } from "react";
import { cn } from "@/utils/ui";

type AgentRuntimeStatus = {
	kind: "api" | "local-cli" | "unconfigured";
	label: string;
	detail?: string;
};

const DEFAULT_RUNTIME_STATUS: AgentRuntimeStatus = {
	kind: "unconfigured",
	label: "Agent optional",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): Record<string, unknown> | undefined {
	if (!isRecord(value)) return undefined;
	const nextValue = value[key];
	return isRecord(nextValue) ? nextValue : undefined;
}

function formatRuntimeStatusFromValues({
	values,
	status,
}: {
	values: Record<string, unknown> | undefined;
	status: unknown;
}): AgentRuntimeStatus {
	if (!values) return DEFAULT_RUNTIME_STATUS;
	if (Array.isArray(status)) {
		const requiredGroups = status.filter(
			(item): item is Record<string, unknown> =>
				isRecord(item) && item.required === true,
		);
		if (
			requiredGroups.length === 0 ||
			requiredGroups.some((item) => item.configured !== true)
		) {
			return DEFAULT_RUNTIME_STATUS;
		}
	}
	const runtime =
		typeof values.AGENT_RUNTIME === "string" ? values.AGENT_RUNTIME : "api";
	if (runtime !== "local-cli") {
		const provider =
			typeof values.AGENT_LLM_PROVIDER === "string"
				? values.AGENT_LLM_PROVIDER
				: "api";
		const model =
			typeof values.AGENT_LLM_MODEL === "string" ? values.AGENT_LLM_MODEL : "";
		return {
			kind: "api",
			label: "API mode",
			detail: model ? `${provider} · ${model}` : provider,
		};
	}

	const cli =
		typeof values.AGENT_CLI_ID === "string" ? values.AGENT_CLI_ID : "cli";
	const model =
		typeof values.AGENT_CLI_MODEL === "string" &&
		values.AGENT_CLI_MODEL !== "default"
			? values.AGENT_CLI_MODEL
			: "";
	return {
		kind: "local-cli",
		label: "Local CLI",
		detail: model ? `${cli} · ${model}` : cli,
	};
}

function useAgentRuntimeStatus() {
	const [runtimeStatus, setRuntimeStatus] = useState<AgentRuntimeStatus>(
		DEFAULT_RUNTIME_STATUS,
	);

	useEffect(() => {
		let cancelled = false;

		async function refreshRuntimeStatus() {
			try {
				const response = await fetch("/api/desktop/config", {
					cache: "no-store",
				});
				if (!response.ok) {
					if (!cancelled) setRuntimeStatus(DEFAULT_RUNTIME_STATUS);
					return;
				}
				const data: unknown = await response.json();
				const values = getRecordField({ value: data, key: "values" });
				const status = isRecord(data) ? data.status : undefined;
				if (!cancelled) {
					setRuntimeStatus(formatRuntimeStatusFromValues({ values, status }));
				}
			} catch {
				if (!cancelled) setRuntimeStatus(DEFAULT_RUNTIME_STATUS);
			}
		}

		void refreshRuntimeStatus();
		const interval = window.setInterval(refreshRuntimeStatus, 5000);
		window.addEventListener("focus", refreshRuntimeStatus);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
			window.removeEventListener("focus", refreshRuntimeStatus);
		};
	}, []);

	return runtimeStatus;
}

export function AgentRuntimeBadge({
	isActive = false,
	className,
}: {
	isActive?: boolean;
	className?: string;
}) {
	const runtimeStatus = useAgentRuntimeStatus();
	const toneClass =
		runtimeStatus.kind === "local-cli"
			? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
			: runtimeStatus.kind === "api"
				? "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
				: "border-border bg-muted/40 text-muted-foreground";
	const dotClass =
		runtimeStatus.kind === "local-cli"
			? "bg-emerald-500"
			: runtimeStatus.kind === "api"
				? "bg-cyan-500"
				: "bg-muted-foreground";

	return (
		<div
			className={cn(
				"electron-no-drag flex h-7 max-w-[11rem] items-center gap-1.5 rounded-full border px-2 text-xs",
				toneClass,
				className,
			)}
			title={
				runtimeStatus.detail
					? `${runtimeStatus.label} · ${runtimeStatus.detail}`
					: runtimeStatus.label
			}
		>
			<span
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					dotClass,
					isActive && "animate-pulse",
				)}
			/>
			<span className="shrink-0 font-medium">{runtimeStatus.label}</span>
			{runtimeStatus.detail ? (
				<span className="min-w-0 truncate opacity-80">
					{runtimeStatus.detail}
				</span>
			) : null}
		</div>
	);
}
