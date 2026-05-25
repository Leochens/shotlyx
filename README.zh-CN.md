# Shotlyx

<p align="center">
  <img src="apps/web/public/logos/shotlyx/logo.png" alt="Shotlyx logo" width="160" />
</p>

[![GuanTou Lab](https://world.guantou.site/badge.svg?theme=dark&accent=red&lang=zh&size=sm)](https://world.guantou.site/)

语言：[English](README.md) | 简体中文

Shotlyx 是一个 Agent 原生的视频编辑器：它提供浏览器里的可视化编辑工作区，并让 AI 助手能够读取当前项目、调用编辑器工具、对时间线做真实修改。

个人主页：[world.guantou.site](https://world.guantou.site/)

## 项目简介

Shotlyx 把可视化时间线编辑器和内部工具调用 Agent 循环结合在一起。编辑器真实状态保留在浏览器里；服务端负责流式模型输出和工具调用意图；浏览器执行与编辑器状态绑定的工具，再把执行结果作为 observation 回传给模型继续推理。

最终，它可以用自然语言完成一部分视频编辑任务，例如添加轨道、插入素材、生成字幕、搜索 Stock 素材、生成旁白、分析静音段，以及生成可编辑的动态图形。

## 项目来源

Shotlyx 的基础视频编辑器来源于 OpenCut 项目，包括核心浏览器编辑体验以及相关编辑器/runtime 基础能力。

让编辑器可以被自然语言操作的 Agent 层，是本项目的原创工作。这包括 Agent 聊天体验、执行模式、内部工具调用循环、编辑器工具 schema、客户端工具执行桥、工具结果回传续写流程、provider-backed Agent 工具，以及 Shotlyx 专属的 MG 生成工作流。

## 功能

- 浏览器视频编辑器：时间线、预览、素材库、文字、字幕、蒙版、特效、关键帧和项目存储。
- Agent 聊天面板，支持 `auto`、`suggest`、`manual` 三种执行模式。
- 通过 Vercel AI SDK tool calling，把内部 MCP-like 编辑器工具暴露给 LLM。
- 客户端执行浏览器内编辑器工具，服务端负责流式推理和工具结果续写。
- Stock 素材搜索/导入、网页搜索/抓取、生图、旁白/TTS、ASR 字幕、静音分析与剪辑工作流。
- Shotlyx MG：生成可编辑的 Remotion-style 动态图形组件。
- Rust/WASM 模块支持时间、音频分析、GPU/合成、特效和蒙版能力。
- Docker 与 Cloudflare/OpenNext 部署脚手架。

## 项目状态

当前仓库正在做公开发布前整理。主要活跃面是 Web 编辑器和 Agent 栈。`apps/desktop` 下的桌面端目前只是一个 GPUI 壳原型，还不是完整桌面版编辑器。

## 目录结构

```text
.
├── apps/
│   ├── web/          # Next.js 编辑器应用和 Agent runtime
│   └── desktop/      # Rust GPUI 桌面壳原型
├── rust/
│   ├── crates/       # time、audio、GPU、masks、effects 等 Rust crate
│   └── wasm/         # Web 应用使用的 wasm-bindgen 包
├── eslint/           # 本地 ESLint 规则
├── docker-compose.yml
├── package.json
└── Cargo.toml
```

重要 Web 模块：

- `apps/web/src/core`：`EditorCore` 和各 manager 初始化。
- `apps/web/src/agent`：聊天 UI、LLM 配置、tool adapter、MCP-like server、工具实现和 Agent 测试。
- `apps/web/src/app/api/agent`：聊天流、工具结果续写、MG job、Stock、Web、Image、Voiceover、Transcription 等服务端 route。
- `apps/web/src/commands`：支持 undo/redo 的编辑命令。
- `apps/web/src/services/storage`：IndexedDB/OPFS 项目和媒体存储。
- `apps/web/src/shotlyx/remotion-components`：可编辑 Shotlyx MG 生成与校验。

## Agent 如何工作

Shotlyx 使用前后端分离的工具执行模型：

1. 浏览器把消息、执行模式、工具 schema、选中引用和品牌上下文发送到 `/api/agent/chat`。
2. 服务端构造 system prompt，并用 AI SDK `streamText` 流式调用模型。
3. 当模型调用工具时，服务端不会直接修改编辑器状态，而是发出 `tool-call` SSE 事件。
4. 浏览器收到工具调用后，在真实 `EditorCore` 上执行 `editor.mcp.execute(...)`。
5. 浏览器把清理后的工具结果 POST 到 `/api/agent/chat/{sessionId}/tool-result`。
6. 服务端把 observation 接回模型循环，直到任务完成或需要用户确认。

这样可以把 provider secret 和服务端 API 留在服务端，同时让所有依赖浏览器编辑器状态的变更都在浏览器 runtime 内完成。

## 环境要求

- Bun 1.2.x
- 可运行 Next.js API routes 的 Node-compatible runtime
- Rust toolchain
- 用于重新构建 WASM 包的 `wasm-pack`
- Docker，如果需要本地 Postgres/Redis 服务
- 推荐使用现代 Chromium 系浏览器体验完整编辑器能力

## 快速开始

安装依赖：

```bash
bun install
```

启动本地服务：

```bash
docker compose up -d db redis serverless-redis-http
```

创建本地环境变量文件：

```bash
cp apps/web/.env.example apps/web/.env.local
```

运行 Web 应用：

```bash
bun run dev:web
```

打开：

```text
http://localhost:3000
```

## 环境变量

完整配置见 [apps/web/.env.example](apps/web/.env.example)。常见分组：

- App/server：`DATABASE_URL`、`BETTER_AUTH_SECRET`、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`
- Agent LLM：`AGENT_LLM_PROVIDER`、`AGENT_LLM_KEY`、`AGENT_LLM_MODEL`、`AGENT_LLM_HOST`
- MG 生成：`AGENT_MG_*`
- 生图：`IMAGE_GENERATION_*`
- Voiceover/TTS：`VOICEOVER_PROVIDER`、`TTS_GENERATION_*` 或 `EDGE_TTS_*`
- ASR：`ASR_*`
- Stock 素材：`PEXELS_API_KEY`、`PIXABAY_API_KEY`、`FREESOUND_API_KEY`
- Web 搜索/抓取：`TAVILY_API_KEY`、`FIRECRAWL_API_KEY`、`BRAVE_SEARCH_API_KEY`、`JINA_API_KEY`

不要提交 `.env.local` 或任何真实凭据。

## 开发命令

```bash
bun run dev:web        # Next.js 开发服务
bun run build:web      # 构建 Web 应用
bun run build:wasm     # 重新构建 Rust/WASM 包
bun run lint:web       # lint Web 源码
bun test               # 运行 Bun 测试
cargo test             # 运行 Rust 测试
```

Web 应用内部命令：

```bash
cd apps/web
bun run dev
bun run build
bun run test:e2e
bun run test:e2e:ui
```

## 测试

仓库包含：

- Agent、编辑器工具、storage migration、timeline、MG 生成和 UI helper 的 Bun 单元测试。
- 覆盖聊天面板、会话管理和 Agent 工具流的 Playwright E2E 测试。
- 覆盖 time、bridge、audio-analysis crate 的 Rust 单元测试。
- `eslint/rules` 下的本地 ESLint 规则测试。

发布前至少运行：

```bash
bun test
cargo test
bun run build:web
```

## 部署

Docker：

```bash
docker compose up --build
```

Compose 文件主要面向本地/自托管开发。任何真实部署前，请替换所有占位 secret。

Cloudflare/OpenNext：

```bash
cd apps/web
bun run preview
bun run deploy
```

部分 Agent route 使用 Node runtime、流式响应、provider SDK 以及文件/二进制处理。把 Cloudflare 部署视为生产可用之前，需要针对目标功能逐项验证兼容性。

## 许可证

Shotlyx 使用 [AGPL-3.0-only](LICENSE) 授权。这是面向网络/服务端软件的强 copyleft 许可证：如果你运行公开的修改版网络服务，许可证要求你以同样条款开放对应源码。

商业授权、私有集成或合作可从 [GuanTou Lab Personal Page](https://world.guantou.site/) 开始联系。

这只是项目工程说明，不构成法律意见。

## 致谢

Shotlyx 的基础编辑器来源于 OpenCut。后续 Agent 操作层以及 Shotlyx 专属 AI 剪辑工作流，是本项目原创开发。

仓库里仍保留了一些相关技术命名，例如 `opencut-wasm` 和 `opencut-graphic-v1`。公开文档应在呈现 Shotlyx 独立产品身份的同时，保留必要的上游来源说明和 notice。

## 贡献

公开仓库准备完成后，欢迎 issue 和 pull request。参与前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md) 和 [Code of Conduct](CODE_OF_CONDUCT.md)。
