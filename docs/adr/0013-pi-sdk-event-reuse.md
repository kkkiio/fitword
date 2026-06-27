# ADR 0013: SSE 事件复用 pi SDK 原生事件

## 背景

fitword 早期实现在 pi SDK 之上建立了一套自定义 SSE 事件体系（`delta`、`tool`、`message`、`session`、`done`、`ready`、`warning`、`error`）。pi SDK 的 `session.subscribe()` 提供了完整的 `AgentSessionEvent` 类型，fitword 只从中提取了 `message_update`（text_delta），其余事件被丢弃，转而在工具内部通过 `state.emit()` 手动发出自定义事件。

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

需要模型行为的测试也必须经过 Pi SDK provider 层，不能在 fitword SSE 层伪造工具卡片或 agent 事件。具体测试策略见 ADR 0015。

### 删除未消费事件

`ready` 事件——当前前端未消费，一并删除。SSE 连接建立由 `fetch()` 返回 response 即可确认。

### 错误处理边界

Agent 运行中的预期内失败由 pi SDK 表达和持久化，fitword 不新增自定义 SSE 错误事件。

- 模型调用失败、工具执行失败、上下文溢出重试等 Agent 语义内错误，遵循 pi SDK 的事件和消息模型。例如 assistant message 的 `stopReason: "error"` / `errorMessage`、`tool_execution_end.isError`、`agent_end` 等。
- fitword 不发送 `event: error`，也不发送 `{ type: 'fitword_error' }` 这类自定义 payload，因为它们不会进入 pi SDK jsonl，刷新或重连后无法作为 session 事实重放。
- `runSessionTurn` 等 fitword wrapper 抛出的预料外异常属于传输或桥接层失败，不伪装成 Agent 历史。服务端应结束当前 SSE 连接，让前端按 transport failure 处理。
- 前端遇到 SSE transport failure 时解除发送态，并重新读取 session 历史；它不能只等待 `agent_end`，也不能追加一条看似来自 Agent 的未持久化错误消息。
- 在没有稳定事件游标前，SSE 不使用自定义事件 ID。未来若实现 `Last-Event-ID` / replay，ID 必须对应 pi SDK session 中可重放的位置，而不是 fitword 临时内存事件。

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| 当前：自定义 SSE 事件 | 前端不依赖 pi SDK 类型 | 两套事件语言，工具内部手动 emit |
| 透传 pi SDK 事件 | 零自定义事件，服务端桥接极薄 | 前端需依赖 pi SDK 类型定义，耦合度略增 |
| 部分透传 + 部分自定义 | 过渡平滑 | 仍是两套体系 |
| 透传 pi SDK 事件 + 自定义错误事件 | 前端能收到结构化错误 | 错误事件不在 pi SDK jsonl 中，破坏 session 事实来源 |

选透传。fitword 已经深度依赖 pi SDK（agent session、工具系统、session 管理），前端依赖其事件类型并不增加实质性耦合，却消除了事件翻译层。

## 后果

- SSE 流中仅包含 `AgentSessionEvent` 类型的事件
- 前端 `use-sessions.ts` 的 `onEvent` 回调改为 `switch (event.type)` 分发
- `pi-agent.ts` 中删除 `streamFallback` 及其依赖函数，删除 `createFitwordTools` 中的 `state.emit()` 调用
- `readSessionMessages()` 不变（历史消息回放是独立路径）
- 测试代码不得恢复 `FITWORD_FORCE_DEMO=1` 或其他绕过 Pi SDK 的事件注入路径；需要模型行为时按 ADR 0015 从 provider 层替换模型
- wrapper 级异常通过 SSE transport failure 表达，前端负责解锁 UI 并重新拉取历史
