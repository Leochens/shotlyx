import { create } from "zustand";

type PropertiesInspectorFocus = "project-subtitles";

interface PropertiesState {
	activeTabPerType: Record<string, string>;
	setActiveTab: (args: { elementType: string; tabId: string }) => void;
	inspectorFocus: PropertiesInspectorFocus | null;
	setInspectorFocus: (focus: PropertiesInspectorFocus | null) => void;
	isTransformScaleLocked: boolean;
	setTransformScaleLocked: (args: { locked: boolean }) => void;
}

export const usePropertiesStore = create<PropertiesState>()((set) => ({
	activeTabPerType: {},
	setActiveTab: ({ elementType, tabId }) =>
		set((state) => ({
			activeTabPerType: { ...state.activeTabPerType, [elementType]: tabId },
		})),
	inspectorFocus: null,
	setInspectorFocus: (focus) => set({ inspectorFocus: focus }),
	isTransformScaleLocked: false,
	setTransformScaleLocked: ({ locked }) =>
		set({ isTransformScaleLocked: locked }),
}));
