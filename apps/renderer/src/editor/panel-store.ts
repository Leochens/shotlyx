import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PANEL_CONFIG } from "@/panels/layout";

export interface PanelSizes {
	chat: number;
	tools: number;
	preview: number;
	properties: number;
	mainContent: number;
	timeline: number;
}

export type PanelId = keyof PanelSizes;
export type AgentPanelMode = "push" | "drawer";

interface PersistedPanelState {
	panels?: Partial<PanelSizes> | null;
	agentPanelOpen?: boolean;
	agentPanelMode?: AgentPanelMode;
	toolsPanel?: number;
	previewPanel?: number;
	propertiesPanel?: number;
	mainContent?: number;
	timeline?: number;
	tools?: number;
	preview?: number;
	properties?: number;
	chat?: number;
}

interface PanelState {
	panels: PanelSizes;
	agentPanelOpen: boolean;
	agentPanelMode: AgentPanelMode;
	setPanel: (args: { panel: PanelId; size: number }) => void;
	setPanels: (sizes: Partial<PanelSizes>) => void;
	setAgentPanelOpen: (open: boolean) => void;
	toggleAgentPanelOpen: () => void;
	setAgentPanelMode: (mode: AgentPanelMode) => void;
	resetPanels: () => void;
}

function isPersistedPanelState(value: unknown): value is PersistedPanelState {
	return typeof value === "object" && value !== null;
}

export const usePanelStore = create<PanelState>()(
	persist(
		(set) => ({
			...PANEL_CONFIG,
			setPanel: ({ panel, size }) =>
				set((state) => ({
					panels: {
						...state.panels,
						[panel]: size,
					},
				})),
			setPanels: (sizes) =>
				set((state) => ({
					panels: {
						...state.panels,
						...sizes,
					},
				})),
			setAgentPanelOpen: (open) => set({ agentPanelOpen: open }),
			toggleAgentPanelOpen: () =>
				set((state) => ({
					agentPanelOpen: !state.agentPanelOpen,
				})),
			setAgentPanelMode: (mode) => set({ agentPanelMode: mode }),
			resetPanels: () => set({ ...PANEL_CONFIG }),
		}),
		{
			name: "panel-sizes",
			version: 4,
			migrate: (persistedState, version) => {
				const state = isPersistedPanelState(persistedState)
					? persistedState
					: null;

				const agentPanelOpen =
					version < 4 || typeof state?.agentPanelOpen !== "boolean"
						? PANEL_CONFIG.agentPanelOpen
						: state.agentPanelOpen;
				const agentPanelMode =
					state?.agentPanelMode === "drawer" || state?.agentPanelMode === "push"
						? state.agentPanelMode
						: PANEL_CONFIG.agentPanelMode;

				if (!state)
					return {
						panels: { ...PANEL_CONFIG.panels },
						agentPanelOpen,
						agentPanelMode,
					};

				if (state.panels && typeof state.panels === "object") {
					return {
						panels: {
							...PANEL_CONFIG.panels,
							...state.panels,
						},
						agentPanelOpen,
						agentPanelMode,
					};
				}

				return {
					panels: {
						chat: state.chat ?? PANEL_CONFIG.panels.chat,
						tools: state.tools ?? state.toolsPanel ?? PANEL_CONFIG.panels.tools,
						preview:
							state.preview ??
							state.previewPanel ??
							PANEL_CONFIG.panels.preview,
						properties:
							state.properties ??
							state.propertiesPanel ??
							PANEL_CONFIG.panels.properties,
						mainContent: state.mainContent ?? PANEL_CONFIG.panels.mainContent,
						timeline: state.timeline ?? PANEL_CONFIG.panels.timeline,
					},
					agentPanelOpen,
					agentPanelMode,
				};
			},
			partialize: (state) => ({
				panels: state.panels,
				agentPanelOpen: state.agentPanelOpen,
				agentPanelMode: state.agentPanelMode,
			}),
		},
	),
);
