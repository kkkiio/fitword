# ADR 0012: 多 Session 管理

## 背景

当前 fitword 只有一个全局 pi agent 实例和一条对话流。用户刷新页面后消息丢失。需要支持多个独立 session，每个 session 持久化在 pi SDK 的 jsonl 文件中，刷新后可恢复。

## 决策

### Session ↔ pi agent 一对一，懒创建

每个 session 对应一个独立的 pi agent 实例（方案 A）。agent 在首次向该 session 发送消息时懒创建，之后缓存在 `Map<string, PiSession>` 中。

**理由：**
- pi SDK 的 `SessionManager` 天然支持按 ID 创建多 session
- 每个 agent 实例天然隔离，并发安全，无需在请求间切换 session 文件
- agent 实例数量 = 用户活跃 session 数，实际不会很多（一个用户通常 3-5 个活跃 session）
- 模型注册、认证等共享组件可以提取到 agent 工厂外

### Session 生命周期

```
新建对话 → 点击 + → 侧边栏不增加任何项
          → 右侧切换到空状态（欢迎界面 + 输入框）
          → 此时没有 sessionId
          
首条消息 → POST /api/chat/stream { message }（无 sessionId）
         → 服务器创建 session（SQLite + pi agent）
         → 响应头或 SSE 首事件返回 sessionId
         → 前端获取 sessionId，侧边栏出现此项
         → 标题取首条消息前 20 字符

后续消息 → POST /api/chat/stream { sessionId, message }
         → 使用已有 agent

刷新页面 → GET /api/sessions → 侧边栏恢复列表
         → 点某个 session → GET /api/sessions/:id/messages → 还原消息

归档     → POST /api/sessions/:id/archive → 标记归档，从侧边栏消失，自动切到空状态
```

### API 设计

```
GET    /api/sessions              → SessionInfo[]（仅未归档）
GET    /api/sessions/:id/messages → ChatMessage[]
POST   /api/sessions/:id/archive  → { ok: true }
```

无 `POST /api/sessions`：首条消息发送时服务端自动创建 session，sessionId 通过 SSE 首事件返回。

`POST /api/chat/stream` 增加 `sessionId` 字段：

```json
{ "sessionId": "xxx", "message": "...", "intent": "score" }
```

### 消息存储

- **SQLite `sessions` 表**：session 元数据（id, title, created_at, updated_at），`GET /api/sessions` 查此表
- **pi SDK jsonl**：消息历史，首条消息时创建，`GET /api/sessions/:id/messages` 查此文件
- **SQLite scoring_records / answers**：评分和答题记录，全局统计用

### 标题生成

- 首条消息发送后：标题取消息前 20 字符，写入 SQLite `sessions.title`
- 前端从 `GET /api/sessions` 获取标题，按 `updated_at` 倒序排列

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| A：每 session 一个 agent | 天然隔离、并发安全 | agent 实例多时内存占用量大 |
| B：单 agent + setSessionFile 切换 | 资源省 | 并发请求可能串扰，需要请求级锁 |

## 后果

- 服务端需维护 session 级消息队列：同一 session 同一时间只允许一个 prompt 执行，并发请求排队或拒绝
- agent 缓存需淘汰策略：最多保留 N 个（如 10），超过则 LRU 淘汰最久未用的
- 前端需管理 `sessions` 列表 + `activeSessionId` 状态
- 移除硬编码欢迎消息，空状态由 session 是否存在决定
- 统计保持全局，不受 session 影响
- 归档状态通过 `sessions.status` 列记录（`'active'` / `'archived'`），`GET /api/sessions` 过滤 `status = 'active'`
