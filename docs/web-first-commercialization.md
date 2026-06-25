# Shotlyx Web 优先商业化接入

## 目标

当前阶段客户端先不考虑，Web 端优先完成账号、积分、套餐、支付、上传配置这条闭环。核心原则是：前端只展示后端给出的产品和账户状态，不在浏览器里推断套餐、积分来源或消耗规则。

## 模块边界

| 模块                  | 位置                                            | 职责                                 |
| --------------------- | ----------------------------------------------- | ------------------------------------ |
| Auth                  | `server/src/auth.ts`                            | 注册、登录、会话、New API key 绑定   |
| Billing ledger        | `server/src/billing.ts`                         | 积分入账、幂等、New API quota 同步   |
| Product catalog       | `server/src/product-catalog.ts`                 | 套餐、积分包、消耗规则               |
| Account billing       | `server/src/account-billing.ts`                 | 用户余额、积分来源拆分、订阅状态     |
| Payment adapter       | `server/src/payments.ts`                        | ZPAY 下单、回调验签、支付入账        |
| Billing Center status | `server/src/billing-center.ts`                  | 外部 Billing Center 配置检查         |
| Object storage status | `server/src/object-storage-config.ts`           | local/COS/R2/S3 配置检查与上传前校验 |
| Cloud storage         | `server/src/cloud-storage.ts`                   | COS STS 直传、完成校验、签名读取 URL |
| Project sync          | `shotlyx_projects` / `shotlyx_media_assets`     | 账号下项目 JSON 和云端素材索引       |
| Web billing client    | `apps/web/src/auth/client.ts`                   | 账户账单状态、checkout、存储配置 API |
| Web account menu      | `apps/web/src/components/auth/account-menu.tsx` | 套餐购买、积分包购买、余额拆分、流水 |

## 后端 API

| API                                  | 鉴权               | 用途                                                 |
| ------------------------------------ | ------------------ | ---------------------------------------------------- |
| `GET /api/account/billing-state`     | Bearer session     | 用户余额、积分拆分、套餐目录、消耗规则、流水         |
| `GET /api/account/billing/catalog`   | Bearer session     | 套餐和消耗规则                                       |
| `POST /api/account/billing/checkout` | Bearer session     | 根据 `productType` + `productCode` 创建支付订单      |
| `GET /api/account/storage/config`    | Bearer session     | 返回对象存储配置状态                                 |
| `POST /api/account/uploads/initiate` | Bearer session     | 校验上传大小，返回 object key 和当前上传模式         |
| `GET /api/account/projects`          | Bearer session     | 列出账号下云端项目                                   |
| `POST /api/account/projects`         | Bearer session     | 保存/同步项目 JSON                                   |
| `GET /api/account/projects/:id`      | Bearer session     | 读取项目 JSON 和素材索引                             |
| `POST /api/account/projects/:id/assets/initiate` | Bearer session | 创建项目素材直传会话                      |
| `POST /api/account/projects/:id/assets/:assetId/complete` | Bearer session | 校验 COS 对象并标记上传完成       |
| `GET /api/account/projects/:id/assets/:assetId/read-url` | Bearer session | 返回素材签名读取 URL              |
| `GET /api/admin/commercial-config`   | Admin token/cookie | 管理端查看套餐、消耗规则、存储和 Billing Center 状态 |

## 积分与套餐

默认产品在 `server/src/product-catalog.ts`：

| 类型   | Code              | 价格     | 到账积分  |
| ------ | ----------------- | -------- | --------- |
| 订阅   | `creator_monthly` | 39 元/月 | 500,000   |
| 订阅   | `studio_monthly`  | 99 元/月 | 1,800,000 |
| 积分包 | `credits_100k`    | 10 元    | 100,000   |
| 积分包 | `credits_500k`    | 45 元    | 550,000   |
| 积分包 | `credits_1m`      | 85 元    | 1,150,000 |

消耗规则通过环境变量覆盖：

| 环境变量                                 | 默认值 |
| ---------------------------------------- | ------ |
| `USAGE_CREDITS_ASR_TRANSCRIPTION_MINUTE` | 1200   |
| `USAGE_CREDITS_LLM_AGENT_TURN`           | 800    |
| `USAGE_CREDITS_VOICEOVER_1K_CHARS`       | 2000   |
| `USAGE_CREDITS_IMAGE_GENERATION`         | 5000   |
| `USAGE_CREDITS_MG_GENERATION`            | 8000   |
| `USAGE_CREDITS_STOCK_IMPORT`             | 500    |

支付成功后，账本 `meta` 会记录 `productType`、`productCode`、`productName`。账户状态的 `creditBreakdown` 按这些字段拆分订阅积分、积分包积分和管理员手动积分。

## Billing Center 接入策略

`https://pay.guantou.site/integration` 当前可作为外部 Billing Center 参考系统。Shotlyx 现在先把接入边界预留出来：

- 配置项：`BILLING_CENTER_BASE_URL`、`BILLING_CENTER_API_KEY`、`BILLING_CENTER_APP_CODE`
- 管理端展示配置状态和缺失项
- 前端和账本只依赖 Shotlyx 自己的 `billing-state` 与 `checkout` API
- 后续切换时只需要新增 Billing Center payment adapter，不需要改账户菜单和积分拆账结构

在正式 API 文档和密钥确认前，生产购买仍走现有 ZPAY 适配器更稳。

## 对象存储与上传

支持预留 driver：

| Driver  | 必填配置                                                               |
| ------- | ---------------------------------------------------------------------- |
| `local` | 无，开发默认                                                           |
| `cos`   | `COS_REGION`、`COS_BUCKET`、`COS_SECRET_ID`、`COS_SECRET_KEY`          |
| `r2`    | `R2_ENDPOINT`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` |
| `s3`    | `S3_ENDPOINT`、`S3_BUCKET`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY` |

项目级上传初始化接口现在做四件事：

1. 校验登录和文件大小。
2. 生成 `shotlyx/users/<userId>/projects/<projectId>/assets/<assetId>/<fileName>` object key。
3. driver 为 COS 时签发短期 STS 凭证，前端用 COS SDK 分片直传。
4. `complete` 阶段用 HEAD 校验对象大小、类型和归属后再标记 uploaded。

当 driver 是 `local` 时返回 `local-preview`，用于本地开发；生产 Web 应配置 `STORAGE_DRIVER=cos`。

推荐 COS 配置：

```env
STORAGE_DRIVER=cos
STORAGE_KEY_PREFIX=shotlyx
STORAGE_MAX_UPLOAD_SIZE_MB=5120
COS_REGION=ap-guangzhou
COS_BUCKET=shotlyx-assets-1250000000
COS_SECRET_ID=replace_with_cos_secret_id
COS_SECRET_KEY=replace_with_cos_secret_key
COS_SIGNED_URL_TTL_SECONDS=3600
COS_UPLOAD_STS_TTL_SECONDS=1800
COS_UPLOAD_SLICE_SIZE_MB=8
```

## 本地预览策略

Web 端可以优先用用户本地文件预览，不必每次都从对象存储拉：

1. 用户选择文件后，立即用 `URL.createObjectURL(file)` 做编辑器预览。
2. 文件先写入 OPFS 本地缓存；如果本地配额不足但用户已登录，则保留当前会话文件并继续云端上传。
3. 对象存储上传在后台进行，完成后保存 `objectKey/readUrl/uploadStatus` 到 IndexedDB 和后端素材表。
4. 当前浏览器会话继续使用本地 object URL，减少首帧等待和带宽浪费。
5. 刷新时先读 OPFS；本地缺失时再用签名 URL 下载回 OPFS 并重建 `blob:` URL。
6. 跨设备打开时，先拉后端项目 JSON 和素材索引，再按需恢复素材。
7. 页面关闭、素材替换或项目卸载时调用 `URL.revokeObjectURL()`。

OPFS 是缓存层，COS 才是云端资产源；项目持久化不能把 blob URL 写进长期项目文件。

## Docker 访问方式

本地完整 Web 优先链路可以直接用 Docker Compose 启动：

```bash
docker compose up --build -d db redis serverless-redis-http server web
```

默认访问地址：

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| Web | `http://localhost:3100/projects` | 注册、登录、进入项目和购买入口 |
| Server | `http://localhost:8787/api/health` | 后端健康检查 |
| Admin | `http://localhost:8787/admin` | 管理端，默认本地 token 是 `local-dev-admin-token` |

生产部署时至少要覆盖这些环境变量：

| 环境变量 | 用途 |
| --- | --- |
| `VITE_SHOTLYX_SERVER_URL` | 浏览器访问后端的公网地址，构建 Web 镜像时写入 |
| `SHOTLYX_SERVER_PUBLIC_URL` | ZPAY 回调和返回地址使用的后端公网地址 |
| `SHOTLYX_ADMIN_TOKEN` | 管理端登录 Token |
| `DATABASE_URL` 或 `POSTGRES_PASSWORD` | 数据库连接或 compose 内置 Postgres 密码 |
| `SHOTLYX_ZPAY_PID` / `SHOTLYX_ZPAY_KEY` | ZPAY 支付配置 |
| `STORAGE_DRIVER` 和对应云存储密钥 | 生产对象存储配置 |

如果修改了 `VITE_SHOTLYX_SERVER_URL`，必须重新构建 Web 镜像：

```bash
docker compose up --build -d web
```
