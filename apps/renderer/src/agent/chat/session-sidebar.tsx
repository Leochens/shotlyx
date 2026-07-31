"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { useAppLocale } from "@/i18n/use-app-locale";
import { useChatStore } from "./store";
import type { ChatSession } from "./types";

interface SessionSidebarProps {
	isOpen: boolean;
	onToggle: () => void;
}

const DEFAULT_SESSION_NAMES = new Set(["新会话", "New conversation"]);

function getLastMessagePreview(params: {
	session: ChatSession;
	copy: { noMessage: string; noContent: string };
}): string {
	const { session, copy } = params;
	const lastMsg = session.messages[session.messages.length - 1];
	if (!lastMsg) return copy.noMessage;
	return lastMsg.content.slice(0, 30) || copy.noContent;
}

function getSessionDisplayName(params: {
	session: ChatSession;
	copy: { newSession: string };
}): string {
	const { session, copy } = params;
	if (DEFAULT_SESSION_NAMES.has(session.name)) return copy.newSession;
	return session.name;
}

export function SessionSidebar({ isOpen, onToggle }: SessionSidebarProps) {
	const { copy } = useAppLocale();
	const chatCopy = copy.editor.chat;
	const {
		sessions,
		activeSessionId,
		activeProjectId,
		switchSession,
		createSession,
		deleteSession,
		renameSession,
	} = useChatStore();

	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editingId !== null && inputRef.current) {
			inputRef.current.focus();
		}
	}, [editingId]);

	const handleStartRename = (session: ChatSession) => {
		setEditingId(session.id);
		setEditName(getSessionDisplayName({ session, copy: chatCopy }));
	};

	const handleConfirmRename = () => {
		if (editingId !== null && editName.trim()) {
			renameSession(editingId, editName.trim());
		}
		setEditingId(null);
		setEditName("");
	};

	const handleCancelRename = () => {
		setEditingId(null);
		setEditName("");
	};

	const handleDeleteClick = (id: string) => {
		if (deletingId === id) {
			deleteSession(id);
			setDeletingId(null);
			if (deleteTimerRef.current) {
				clearTimeout(deleteTimerRef.current);
				deleteTimerRef.current = null;
			}
		} else {
			setDeletingId(id);
			deleteTimerRef.current = setTimeout(() => {
				setDeletingId((current) => (current === id ? null : current));
			}, 3000);
		}
	};

	useEffect(() => {
		return () => {
			if (deleteTimerRef.current) {
				clearTimeout(deleteTimerRef.current);
			}
		};
	}, []);

	if (!isOpen) {
		return (
			<div className="flex w-10 flex-col items-center border-r bg-muted/30 py-2">
				<button
					type="button"
					onClick={onToggle}
					data-testid="toggle-sidebar-button"
					className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
					aria-label={chatCopy.openSessions}
					title={chatCopy.openSessions}
				>
					<MessageSquare size={18} />
				</button>
			</div>
		);
	}

	return (
		<div className="flex w-56 flex-col border-r bg-muted/30">
			<div className="flex items-center justify-between border-b px-3 py-2">
				<span className="text-xs font-medium text-muted-foreground">
					{chatCopy.sessions}
				</span>
				<button
					type="button"
					onClick={onToggle}
					data-testid="toggle-sidebar-button"
					className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
					aria-label={chatCopy.closeSessions}
					title={chatCopy.closeSessions}
				>
					<MessageSquare size={16} />
				</button>
			</div>

			<div className="flex-1 overflow-y-auto">
				{sessions
					.filter((session) => session.projectId === activeProjectId)
					.map((session) => {
						const isActive = session.id === activeSessionId;
						const isEditing = editingId === session.id;
						const isDeleting = deletingId === session.id;

						return (
							<div
								key={session.id}
								role="button"
								tabIndex={0}
								onClick={() => {
									if (!isEditing) {
										switchSession(session.id);
									}
								}}
								onKeyDown={(event) => {
									if (isEditing) return;
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										switchSession(session.id);
									}
								}}
								className={`group relative cursor-pointer border-b px-3 py-2 ${
									isActive ? "bg-accent" : "hover:bg-accent/60"
								}`}
							>
								{isEditing ? (
									<div className="flex items-center gap-1">
										<input
											ref={inputRef}
											type="text"
											value={editName}
											onChange={(e) => setEditName(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.stopPropagation();
													handleConfirmRename();
												} else if (e.key === "Escape") {
													e.stopPropagation();
													handleCancelRename();
												}
											}}
											onClick={(e) => e.stopPropagation()}
											className="flex-1 rounded border bg-background px-2 py-1 text-xs text-foreground outline-none"
										/>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												handleConfirmRename();
											}}
											className="rounded p-0.5 text-green-600 hover:bg-accent"
											aria-label={chatCopy.confirmRename}
										>
											<Check size={12} />
										</button>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												handleCancelRename();
											}}
											className="rounded p-0.5 text-red-500 hover:bg-accent"
											aria-label={chatCopy.cancelRename}
										>
											<X size={12} />
										</button>
									</div>
								) : (
									<>
										<div className="flex items-center justify-between">
											<span className="truncate text-xs font-medium text-foreground">
												{getSessionDisplayName({
													session,
													copy: chatCopy,
												})}
											</span>
											<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleStartRename(session);
													}}
													data-testid="rename-session-button"
													className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
													aria-label={chatCopy.renameSession}
												>
													<Pencil size={12} />
												</button>
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleDeleteClick(session.id);
													}}
													data-testid="delete-session-button"
													className={`rounded p-0.5 hover:bg-accent ${
														isDeleting
															? "text-red-400"
															: "text-muted-foreground hover:text-red-400"
													}`}
													aria-label={chatCopy.deleteSession}
												>
													<Trash2 size={12} />
												</button>
											</div>
										</div>
										<div className="mt-0.5 truncate text-[11px] text-muted-foreground">
											{getLastMessagePreview({
												session,
												copy: chatCopy,
											})}
										</div>
									</>
								)}
							</div>
						);
					})}
			</div>

			<div className="border-t p-2">
				<button
					type="button"
					onClick={() => createSession(chatCopy.newSession)}
					className="flex w-full items-center justify-center gap-1.5 rounded bg-accent py-1.5 text-xs text-muted-foreground hover:text-foreground"
				>
					<Plus size={14} />
					{chatCopy.newSession}
				</button>
			</div>
		</div>
	);
}
