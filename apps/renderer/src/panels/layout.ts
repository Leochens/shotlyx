export const PANEL_CONFIG = {
	panels: {
		chat: 30,
		tools: 25,
		preview: 50,
		properties: 25,
		mainContent: 50,
		timeline: 50,
	},
	agentPanelOpen: true,
	agentPanelMode: "push" as const,
} as const;
