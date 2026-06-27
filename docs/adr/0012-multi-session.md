# ADR 0012: 多 Session 管理

## 背景

fitword 需要支持多个独立对话。每个对话都应能持久化、刷新后恢复、从侧边栏切换，并在归档后从常用列表中隐藏。

多 session 设计里有两个容易混淆的动作：

- 用户点击「新建对话」只是进入一个空白草稿状态。
- 用户发送首条消息才真正创建后端 session，并启动 Agent 处理。

另一个需要明确的边界是消息发送和事件读取。发送消息是一次动作 API；SSE 是读取/订阅当前 session 事件的 API。二者职责不同，不应合并成一个既发送消息又返回流的接口。

## 决策

### 草稿对话不落库

点击「新建对话」只更新前端本地状态：

- 清空当前选中的 `sessionId`
- 显示空白对话界面和输入框
- 不调用后端
- 不创建 SQLite `sessions` 记录
- 不创建 pi SDK jsonl session
- 不在侧边栏增加空 session

只有用户提交第一条消息时，session 才从草稿变成持久化会话。

### Session ↔ pi agent 一对一，懒创建

每个持久化 session 对应一个独立的 pi agent 实例。agent 在该 session 第一次需要处理消息时懒创建，之后缓存在 `Map<string, PiSession>` 中。

理由：

- pi SDK 的 `SessionManager` 天然支持按 ID 管理多个 session
- 每个 agent 实例隔离自己的上下文，避免不同 session 串扰
- 单机个人工具的活跃 session 数量有限，内存压力可控
- 模型注册、认证等共享组件可以放在 agent 工厂外复用

### API 边界

#### 创建 session 并发送首条消息

```http
POST /api/sessions
Content-Type: application/json

{ "message": "...", "intent": "score" }
```

语义：

- 创建 SQLite `sessions` 记录
- 标题取首条消息前 20 字符
- 创建或打开对应 pi SDK session
- 将首条消息交给 Agent 处理
- 返回新 session 信息

`intent` 可省略。`intent: "score"` 表示本条消息是写作评分请求。

#### 向已有 session 发送消息

```http
POST /api/sessions/:id/messages
Content-Type: application/json

{ "message": "...", "intent": "score" }
```

语义：

- 校验 session 存在且未归档
- 将消息交给该 session 的 Agent 处理
- 更新 `sessions.updated_at`
- 返回操作结果或更新后的 session 信息

#### 订阅 session 事件

```http
GET /api/sessions/:id/events
Accept: text/event-stream
```

语义：

- 只订阅/读取该 session 的 SSE 事件
- 不创建 session
- 不发送消息
- 不接收 `message` 请求体
- 不引入公开的 `turn`、`run`、`turnId`、`runId` 概念

一个 session 在产品语义上只需要一个事件订阅通道。除非未来出现明确需求，否则 API 不暴露额外的事件流标识。

#### 查询和归档

```http
GET  /api/sessions              → SessionInfo[]（仅未归档）
GET  /api/sessions/:id/messages → ChatMessage[]
POST /api/sessions/:id/archive  → { ok: true }
```

归档只改变 session 状态，不删除 pi SDK jsonl 文件和业务数据。

### Session 生命周期

```
新建对话 → 点击 + → 前端清空 activeSessionId
          → 显示空白对话
          → 后端无动作

首条消息 → POST /api/sessions { message, intent? }
          → 创建 SQLite session
          → 创建/打开 pi SDK session
          → Agent 开始处理首条消息
          → 前端获得 sessionId，侧边栏出现新 session
          → GET /api/sessions/:id/events 订阅事件

后续消息 → POST /api/sessions/:id/messages { message, intent? }
          → 使用已有 session 的 agent
          → 已有 GET /api/sessions/:id/events 继续接收事件

刷新页面 → GET /api/sessions 恢复侧边栏
          → 点某个 session
          → GET /api/sessions/:id/messages 还原历史消息
          → GET /api/sessions/:id/events 订阅后续事件

归档     → POST /api/sessions/:id/archive
          → 标记归档
          → 从侧边栏消失
          → 如果当前选中该 session，前端切到空白草稿状态
```

### 消息和事件存储

- SQLite `sessions` 表保存 session 元数据：`id`、`title`、`status`、`created_at`、`updated_at`
- pi SDK jsonl 保存对话历史，`GET /api/sessions/:id/messages` 从中读取并转换为 UI 消息
- SQLite `answers`、`questions`、`scoring_records` 保存练习业务数据，统计仍然是全局统计
- SSE 事件使用 ADR 0013 定义的 pi SDK 原生 `AgentSessionEvent` 形状

### 并发约束

同一 session 同一时间只处理一个 Agent prompt。若前一条消息仍在处理中，后续发送请求应排队或返回冲突错误。具体策略由实现选择，但不能让同一 session 的多个 Agent loop 并发写同一段会话历史。

不同 session 之间可以并发处理。

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| 当前决策：发送 API 与 SSE 订阅 API 分离 | HTTP 语义清楚；首条消息创建 session；SSE 不承担写动作 | 前端需要协调发送请求和事件订阅 |
| `POST /api/chat/stream` 同时发送消息并返回 SSE | 单个请求完成所有事 | 把动作和读取混在一起；首条消息创建、sessionId 返回、流生命周期耦合过重 |
| 点击「新建对话」立即创建空 session | sessionId 提前存在，前端状态简单 | 会产生用户可能永远不用的空 session，污染侧边栏和本地存储 |
| 单 agent + 请求时切换 session 文件 | 资源省 | 并发请求可能串扰，需要复杂锁机制 |

## 后果

- 前端需要区分草稿对话和持久化 session
- 后端需要新增 `POST /api/sessions`、`POST /api/sessions/:id/messages`、`GET /api/sessions/:id/events`
- 旧的 `POST /api/chat/stream` 不再作为多 session API 的目标形状
- 侧边栏只展示已创建且未归档的 session
- 服务端需维护 session 级消息队列或冲突保护
- agent 缓存可按 LRU 淘汰最久未使用的 session agent
- 统计保持全局，不按 session 分割
