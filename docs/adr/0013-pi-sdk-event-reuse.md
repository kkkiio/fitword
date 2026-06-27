# ADR 0013: SSE 事件复用 pi SDK 原生事件

## 背景

fitword 当前在 pi SDK 之上建立了一套自定义 SSE 事件体系（`delta`、`tool`、`message`、`session`、`done`、`ready`、`warning`、`error`）。pi SDK 的 `session.subscribe()` 提供了完整的 `AgentSessionEvent` 类型，fitword 只从中提取了 `message_update`（text_delta），其余事件被丢弃，转而在工具内部通过 `state.emit()` 手动发出自定义事件。

这引入了两套并行的事件语言，增加了维护成本和理解项目的负担。

## 决策

**SSE 流直接透传 pi SDK 的 `AgentSessionEvent`，不再建立自定义事件抽象层。**

前端直接消费 pi SDK 事件类型，服务端不做翻译、重命名。

### 事件映射

pi SDK 原生事件完整覆盖 fitword 所有需求：

| pi SDK 事件 | 前端行为 |
|---|---|
| `message_start` | 添加消息到聊天（用户或 agent） |
| `message_update` | 流式追加 text_delta |
| `message_end` | 标记消息完成 |
| `tool_execution_start` | 根据 toolName 渲染题目卡片 / 评分卡片。args 即卡片数据，toolCallId 即卡片 id |
| `tool_execution_end` | 标记卡片完成（取消 loading） |
| `agent_end` | 本轮对话结束 |

### 用户消息

用户消息由 pi SDK 的 `agentLoop` 在收到 prompt 后自动产生 `message_start` / `message_end` 事件，fitword 不再需要服务端回显——删除 `emit('message', ...)`。

### 工具不再手动 emit

删除 `createFitwordTools` 中所有 `state.emit?.('tool', ...)` 调用。`tool_execution_start` / `tool_execution_end` 由 pi SDK 在工具生命周期中自动产生，前端从 args 和 result.details 获取所需数据。

### 删除 demo 降级路径

删除 `streamFallback`、`demoQuestion`、`demoScore`、`choiceSamples` 及 `FITWORD_FORCE_DEMO` 环境变量。没有 LLM 的 fitword 没有实用价值，不应为此维护一条独立的事件路径。

### 删除未消费事件

`ready` 事件——当前前端未消费，一并删除。SSE 连接建立由 `fetch()` 返回 response 即可确认。

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| 当前：自定义 SSE 事件 | 前端不依赖 pi SDK 类型 | 两套事件语言，工具内部手动 emit |
| 透传 pi SDK 事件 | 零自定义事件，服务端桥接极薄 | 前端需依赖 pi SDK 类型定义，耦合度略增 |
| 部分透传 + 部分自定义 | 过渡平滑 | 仍是两套体系 |

选透传。fitword 已经深度依赖 pi SDK（agent session、工具系统、session 管理），前端依赖其事件类型并不增加实质性耦合，却消除了事件翻译层。

## 后果

- SSE 流中仅包含 `AgentSessionEvent` 类型的事件
- 前端 `use-sessions.ts` 的 `onEvent` 回调改为 `switch (event.type)` 分发
- `pi-agent.ts` 中删除 `streamFallback` 及其依赖函数，删除 `createFitwordTools` 中的 `state.emit()` 调用
- `readSessionMessages()` 不变（历史消息回放是独立路径）
- e2e 测试不再依赖 `FITWORD_FORCE_DEMO=1`；需要 LLM 的场景按模型配置决定是否启用
