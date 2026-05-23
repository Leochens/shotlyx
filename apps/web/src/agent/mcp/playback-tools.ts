import type { EditorCore } from "@/core";
import type { Tool } from "./types";
import type { MediaTime } from "@/wasm";
import { requireNumberParam } from "./validation";

export function buildPlaybackTools({
	editor,
	deps,
}: {
	editor: EditorCore;
	deps: { mediaTimeFromSeconds: (args: { seconds: number }) => MediaTime };
}): Tool[] {
	return [
		{
			name: "playback_play",
			description: "开始播放",
			parameters: {},
			mutating: true,
			handler: () => {
				editor.playback.play();
				return { isPlaying: true };
			},
		},
		{
			name: "playback_pause",
			description: "暂停播放",
			parameters: {},
			mutating: true,
			handler: () => {
				editor.playback.pause();
				return { isPlaying: false };
			},
		},
		{
			name: "playback_seek",
			description: "将播放头移动到指定时间（秒）",
			parameters: {
				time: {
					type: "number",
					description: "目标时间（秒）",
				},
			},
			mutating: true,
			handler: (params) => {
				const seconds = requireNumberParam(params, "time");
				const time = deps.mediaTimeFromSeconds({ seconds });
				editor.playback.seek({ time });
				return { currentTime: seconds };
			},
		},
		{
			name: "playback_get_state",
			description: "获取当前播放状态",
			parameters: {},
			handler: () => ({
				isPlaying: editor.playback.getIsPlaying(),
				currentTime: editor.playback.getCurrentTime(),
			}),
		},
		{
			name: "playback_toggle",
			description: "切换播放/暂停状态",
			parameters: {},
			mutating: true,
			handler: () => {
				editor.playback.toggle();
				return { isPlaying: editor.playback.getIsPlaying() };
			},
		},
		{
			name: "playback_set_volume",
			description: "设置播放音量（0.0 到 1.0）",
			parameters: {
				volume: {
					type: "number",
					description: "音量大小，范围为 0.0 到 1.0",
				},
			},
			mutating: true,
			handler: (params) => {
				const volume = requireNumberParam(params, "volume");
				const clamped = Math.max(0, Math.min(1, volume));
				editor.playback.setVolume({ volume: clamped });
				return { volume: clamped };
			},
		},
		{
			name: "playback_toggle_mute",
			description: "切换静音状态",
			parameters: {},
			mutating: true,
			handler: () => {
				editor.playback.toggleMute();
				return { muted: editor.playback.isMuted() };
			},
		},
		{
			name: "playback_get_duration",
			description: "获取时间线总时长",
			parameters: {},
			handler: () => {
				const totalDuration = editor.timeline.getTotalDuration();
				const lastFrameTime = editor.timeline.getLastFrameTime();
				return {
					totalDuration,
					lastFrameTime,
				};
			},
		},
	];
}
