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

上传初始化接口现在做三件事：

1. 校验登录和文件大小。
2. 生成稳定 object key。
3. 返回当前上传模式。

当 driver 是 `local` 时返回 `local-preview`；远端 driver 配好后返回 `direct-upload-pending`，后续补签名直传 URL 即可。

## 本地预览策略

Web 端可以优先用用户本地文件预览，不必每次都从对象存储拉：

1. 用户选择文件后，立即用 `URL.createObjectURL(file)` 做编辑器预览。
2. 对象存储上传在后台进行，完成后保存 `objectKey/readUrl` 到项目数据。
3. 当前浏览器会话继续使用本地 object URL，减少首帧等待和带宽浪费。
4. 刷新或跨设备打开时，使用对象存储 `readUrl` 或签名 URL 恢复素材。
5. 页面关闭、素材替换或项目卸载时调用 `URL.revokeObjectURL()`。

如果要进一步增强粘性，可以把原始文件句柄或切片缓存放到 OPFS/IndexedDB，但项目持久化仍应以对象存储 key 为准，不能把 blob URL 写进长期项目文件。
