import { create } from "zustand";

interface WatermarkAdjustState {
	isAdjustingWatermark: boolean;
	setAdjustingWatermark: (isAdjustingWatermark: boolean) => void;
	toggleAdjustingWatermark: () => void;
}

export const useWatermarkAdjustStore = create<WatermarkAdjustState>((set) => ({
	isAdjustingWatermark: false,
	setAdjustingWatermark: (isAdjustingWatermark) =>
		set({ isAdjustingWatermark }),
	toggleAdjustingWatermark: () =>
		set((state) => ({
			isAdjustingWatermark: !state.isAdjustingWatermark,
		})),
}));
