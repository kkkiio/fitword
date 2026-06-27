# ADR 0004: 使用 pi SDK 作为 Agent 框架

## 背景

fitword 需要 Agent 能力：管理 LLM 对话、处理工具调用、持久化会话。有三种路径：基于现有框架、基于 AI SDK、或从零实现。

## 决策

使用 **pi SDK**（`@earendil-works/pi-agent-core`）作为 Agent 运行框架。

核心依赖：

- `createAgentSession`：创建和管理 Agent 会话
- `SessionManager`：对话历史持久化（jsonl）
- `ModelRegistry`：多 provider 支持，用户自行配置 API key
- `Agent` 的工具系统：注册 fitword 的业务工具（出题、评分）

## 备选方案

| 方案          | 优点                                                                                | 缺点                                                           |
| ------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| pi SDK        | 完整 Agent harness，session 管理、工具系统、stream 处理开箱即用；与 roundtable 同源 | 依赖 pi SDK 的版本节奏                                         |
| Vercel AI SDK | 社区活跃，文档丰富                                                                  | 偏向无状态 API 调用，Agent harness 需要自己搭                  |
| 从零实现      | 完全可控                                                                            | v0.1 需重复实现 agent loop、tool dispatch、session persistence |

## 后果

- Agent loop、stream 处理、session 管理由 pi SDK 负责，fitword 聚焦业务工具和 UI
- pi SDK 的 model registry 让用户可以自由选择 LLM provider
- 所有数据统一存放在 `~/.fitword/` 下：
  - SQLite：`~/.fitword/fitword.db`
  - pi SDK sessions：通过 `cwd = ~/.fitword/` 配置，jsonl 写入 `~/.fitword/sessions/`
- 仅注册 fitword 自有工具（`ask_question`、`record_answer`、`evaluate_writing`、`get_practice_stats`），禁用 pi SDK 内置工具（read、bash、edit、write）
- 运行时架构：

```
┌──────────┐     ┌───────────┐     ┌───────────┐
│  Web UI  │ ←→  │  Server   │ ←→  │  pi SDK   │ ←→ LLM API
│ (React)  │     │ (local)   │     │  Agent    │
└──────────┘     └─────┬─────┘     └─────┬─────┘
                       │                 │
                  ~/.fitword/     ~/.fitword/sessions/
                 ┌─────▼─────┐     ┌─────▼──────┐
                 │  SQLite   │     │   jsonl    │
                 │ (业务数据) │     │ (对话历史)  │
                 └───────────┘     └────────────┘
```
