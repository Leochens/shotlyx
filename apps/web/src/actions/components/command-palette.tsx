"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Command, Search } from "lucide-react";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ACTIONS, invokeAction, type TActionWithOptionalArgs } from "@/actions";
import { useKeyboardShortcutsHelp } from "@/actions/use-keyboard-shortcuts-help";
import { usePanelStore } from "@/editor/panel-store";
import { cn } from "@/utils/ui";
import { useAppLocale } from "@/i18n/use-app-locale";

type CommandEntry =
	| {
			id: `action:${TActionWithOptionalArgs}`;
			title: string;
			category: string;
			keywords: string;
			shortcutKeys: string[];
			run: () => void;
	  }
	| {
			id: "open-agent";
			title: string;
			category: string;
			keywords: string;
			shortcutKeys: string[];
			run: () => void;
	  };

const QUICK_ACTIONS: TActionWithOptionalArgs[] = [
	"split",
	"merge-selected",
	"duplicate-selected",
	"create-still-frame",
	"delete-selected",
	"copy-selected",
	"paste-copied",
	"toggle-snapping",
	"toggle-ripple-editing",
	"select-all",
	"deselect-all",
	"undo",
	"redo",
];

export function CommandPaletteButton() {
	const { copy } = useAppLocale();
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-8 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
				aria-label={copy.editor.commandPalette.open}
				title={copy.editor.commandPalette.title}
				onClick={() => setOpen(true)}
			>
				<Command className="size-4" />
			</Button>
			<EditorCommandPalette open={open} onOpenChange={setOpen} />
		</>
	);
}

function EditorCommandPalette({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [query, setQuery] = useState("");
	const { copy } = useAppLocale();
	const paletteCopy = copy.editor.commandPalette;
	const inputRef = useRef<HTMLInputElement>(null);
	const { shortcuts } = useKeyboardShortcutsHelp();
	const setAgentPanelOpen = usePanelStore((state) => state.setAgentPanelOpen);

	useEffect(() => {
		if (!open) return;
		const id = requestAnimationFrame(() => inputRef.current?.focus());
		return () => cancelAnimationFrame(id);
	}, [open]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== "k") return;
			if (!event.metaKey && !event.ctrlKey) return;
			event.preventDefault();
			onOpenChange(true);
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onOpenChange]);

	const shortcutByAction = useMemo(() => {
		const map = new Map<TActionWithOptionalArgs, string[]>();
		for (const shortcut of shortcuts) {
			map.set(shortcut.action, shortcut.keys);
		}
		return map;
	}, [shortcuts]);

	const commands = useMemo<CommandEntry[]>(
		() => [
			{
				id: "open-agent",
				title: paletteCopy.openAgent,
				category: paletteCopy.agentCategory,
				keywords: "agent ai command center ask edit",
				shortcutKeys: [],
				run: () => setAgentPanelOpen(true),
			},
			...QUICK_ACTIONS.map((action) => {
				const definition = ACTIONS[action];
				return {
					id: `action:${action}` as const,
					title: definition.description,
					category: definition.category,
					keywords: `${action} ${definition.description} ${definition.category}`,
					shortcutKeys: shortcutByAction.get(action) ?? [],
					run: () => invokeAction(action, undefined, "mouseclick"),
				};
			}),
		],
		[
			paletteCopy.agentCategory,
			paletteCopy.openAgent,
			setAgentPanelOpen,
			shortcutByAction,
		],
	);

	const normalizedQuery = query.trim().toLowerCase();
	const visibleCommands = normalizedQuery
		? commands.filter((command) =>
				`${command.title} ${command.category} ${command.keywords}`
					.toLowerCase()
					.includes(normalizedQuery),
			)
		: commands;

	const runCommand = (command: CommandEntry) => {
		command.run();
		onOpenChange(false);
		setQuery("");
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden rounded-sm border-cyan-300/20 bg-[#07100d] p-0 text-slate-100 shadow-[0_30px_120px_rgba(0,0,0,0.48)] sm:max-w-xl">
				<DialogTitle>
					<span className="sr-only">{paletteCopy.title}</span>
				</DialogTitle>
				<DialogDescription className="sr-only">
					{paletteCopy.description}
				</DialogDescription>
				<DialogBody className="gap-0 p-0">
					<div className="flex h-12 items-center gap-2 border-b border-cyan-300/10 px-3">
						<Search className="size-4 text-cyan-200" />
						<input
							ref={inputRef}
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={paletteCopy.placeholder}
							className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
						/>
					</div>
					<div className="max-h-[22rem] overflow-y-auto p-2">
						{visibleCommands.length === 0 ? (
							<div className="px-3 py-8 text-center text-sm text-slate-500">
								{paletteCopy.empty}
							</div>
						) : (
							visibleCommands.map((command) => (
								<button
									key={command.id}
									type="button"
									onClick={() => runCommand(command)}
									className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left transition-colors hover:bg-cyan-300/10"
								>
									<span
										className={cn(
											"flex size-7 shrink-0 items-center justify-center rounded-sm border",
											command.id === "open-agent"
												? "border-cyan-300/25 bg-cyan-300/10 text-cyan-200"
												: "border-white/10 bg-white/[0.03] text-slate-400",
										)}
									>
										{command.id === "open-agent" ? (
											<Bot className="size-3.5" />
										) : (
											<Command className="size-3.5" />
										)}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium text-slate-100">
											{command.title}
										</span>
										<span className="block truncate text-[0.68rem] uppercase tracking-[0.12em] text-slate-500">
											{command.category}
										</span>
									</span>
									{command.shortcutKeys.length > 0 ? (
										<span className="flex shrink-0 gap-1">
											{command.shortcutKeys.slice(0, 2).map((key) => (
												<span
													key={key}
													className="rounded-sm border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[0.65rem] text-slate-400"
												>
													{key}
												</span>
											))}
										</span>
									) : null}
								</button>
							))
						)}
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
