# Shotlyx 导出性能根因排查

日期：2026-06-22

## 结论

当前导出慢的主要原因不是单个小 bug，而是导出架构本身：Shotlyx 现在把工程按时间线逐帧重新渲染到 Canvas/WASM compositor，再用 mediabunny 的 `CanvasSource` 经 WebCodecs 编码成 MP4/WebM。这个路径天然会按 `项目时长 * fps * 可见层数/效果复杂度` 增长，不能像成熟原生剪辑软件那样大量复用源视频码流、代理缓存、硬件编码和原生合成管线。

和剪映这类产品的差距，核心在三点：

1. Shotlyx 当前主导出链路是浏览器逐帧合成，剪映类产品通常是原生媒体管线，能更充分使用 VideoToolbox/MediaCodec/NVENC 等硬件能力。
2. Shotlyx 对视频素材逐帧解码成 Canvas 后再合成再编码；没有面向“无变化片段”的 stream copy、smart render 或代理文件复用。
3. MG/Remotion 片段导出前还会单独预渲染成 PNG 帧序列，再作为图片序列进入主导出，复杂工程会出现第二轮逐帧成本。

## 证据

### 1. 主链路逐帧渲染后再编码

`apps/renderer/src/services/renderer/scene-exporter.ts` 中，导出使用 `BufferTarget` + `CanvasSource`：

- `CanvasSource(this.renderer.getOutputCanvas(), { codec: "avc" | "vp9" })`
- 每一帧循环执行 `await this.renderer.render(...)`
- 随后 `await videoSource.add(...)`
- 最后 `await output.finalize()`

这说明导出不是把时间线交给 ffmpeg/native pipeline 一次性处理，而是应用层逐帧喂给编码器。

### 2. 项目导出阶段是串行流水

`apps/renderer/src/core/managers/renderer-manager.ts` 的顺序是：

1. `prerenderShotlyxMGExportSegments`
2. `createTimelineAudioBuffer`
3. `buildScene`
4. `new SceneExporter(...).export(...)`

预渲染、混音和最终编码基本是串行阶段。即使 MG 内部有少量并发，主导出阶段仍是逐帧顺序推进。

### 3. 视频素材也是逐帧取 Canvas

`apps/renderer/src/services/renderer/resolve.ts` 对 `VideoNode` 调用：

```ts
videoCache.getFrameAt({ mediaId, file, time })
```

`apps/renderer/src/services/video-cache/service.ts` 使用 mediabunny `CanvasSink` 取帧，并为每个 mediaId 串行维护 `frameChain`。这对预览很合理，但导出时会把源视频先解码为 Canvas，再进入合成/编码，无法走直接码流复用。

### 4. MG/Remotion 有额外 PNG 帧序列成本

`apps/renderer/src/api/desktop/remotion/mg-render/route.ts` 调用 `renderFrames`：

- `imageFormat: "png"`
- `outputDir: null`
- `onFrameBuffer` 把每帧 `buffer.toString("base64")` 发回前端

这意味着 MG 片段需要先 Chromium/Remotion 渲染一遍，再 PNG 编码/传输/解码，之后主导出还要再合成并编码一遍。

### 5. ffmpeg 已打包但不在最终导出主路径

`apps/renderer/src/desktop/media/ffmpeg.ts` 主要用于媒体分析、抽帧、导入时转浏览器可解码格式。最终导出链路没有调用 `ffmpeg`、`h264_videotoolbox`、`hevc_videotoolbox` 或 stream copy。

## 最可能的瓶颈排序

1. 最主要：逐帧 Canvas/WASM 合成 + WebCodecs 编码，随时长和 fps 线性增长。
2. 高影响：视频素材逐帧解码为 Canvas，无法复用源视频码流。
3. 高影响：MG/Remotion 先渲 PNG 序列，再进入主导出二次合成。
4. 中影响：整段音频先混成 `AudioBuffer`，长项目会增加准备时间和内存压力。
5. 中影响：使用 `BufferTarget`，导出完成前整段结果在内存中累积，长视频 finalize 和保存阶段会更重。

## 优化方向

### 短期

- 给导出增加阶段耗时日志：MG 预渲染、音频混合、逐帧 render、`videoSource.add`、`output.finalize` 分开统计，先拿真实项目数据。
- 默认导出时提供 720p/低 fps 草稿模式，降低 `frameCount * pixels`。
- 对 MG 片段增加更强缓存：同一资产、参数、fps、尺寸、时长不变时复用上次帧序列。

### 中期

- 桌面端增加 ffmpeg/native export backend：Canvas 合成结果可以 pipe 到 ffmpeg，优先尝试 macOS `h264_videotoolbox`，并改为流式写文件。
- 对无特效、无变换、无叠层的纯视频片段做 fast path：能 stream copy 就不要解码重编码。
- 把 MG 中间产物从 PNG/base64 改为更轻的帧缓存或直接参与主合成，减少中间编解码。

### 长期

- 建代理/预渲染缓存体系：导入时生成编辑代理，导出时按区段重用。
- 建分段渲染 DAG：只有有叠层/特效/字幕的区段重渲，普通视频区段走原始码流或代理。
- 在桌面端把媒体解码、合成、编码更多下沉到原生层，浏览器层只负责编辑 UI 和任务调度。

## 一句话根因

Shotlyx 现在的导出是“浏览器编辑器逐帧重放并重新编码”，而剪映类产品是“原生媒体引擎尽量少重算、能硬编硬解、能复用码流就复用”。所以速度差距不是调一个 preset 能彻底解决的，需要把导出后端从浏览器逐帧路径升级为分段、缓存、硬件加速的媒体管线。
