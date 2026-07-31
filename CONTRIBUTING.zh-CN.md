# 参与 Shotlyx

英文文档是规范版本。

## 开始之前

- 先搜索已有 issue。
- Pull Request 保持单一目标，并说明用户可见行为。
- 不要提交凭证、私有媒体、本地项目数据或发布产物。
- 大型架构调整应先提交 issue 或设计说明。

## 开发与验证

```bash
bun install
bun run dev:desktop

bun test
bun run lint:renderer
cargo test --workspace
bun run build:desktop
```

UI 变更请附截图或短录屏；存储、迁移、Provider 和打包变更应包含针对性测试。

## 工程约束

- 编辑器变更尽量通过命令系统实现可撤销。
- `EditorCore` 是活动编辑状态的唯一所有者。
- 本地 API 保持进程内运行，不引入托管后端依赖。
- 保持 `.shotlyx` 格式兼容，或提供明确迁移。
- 密钥只进入 Electron `safeStorage`。
- Provider 请求必须由用户操作触发。
- 不加入遥测、自动崩溃上传、自动更新或静默模型下载。
- 第三方代码和资产必须先确认许可证来源并补齐 notice。

## DCO

Shotlyx 使用 [Developer Certificate of Origin 1.1](DCO.md)，不使用 CLA。
每个提交都需要签署：

```bash
git commit -s -m "说明本次修改"
```

签署表示你有权按仓库的 `GPL-3.0-only` 许可证贡献这部分工作。
