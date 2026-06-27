# ADR 0014: `<instruction>` Tag 标注评分意图

## 背景

当前写作评分功能通过裸文本前缀标注意图：

```
用户请求写作评分，请评分并调用 evaluate_writing 工具保存：\n{用户原文}
```

这段前缀会随用户消息写入 pi SDK 的 jsonl 会话文件。`readSessionMessages()` 读取历史消息时无法区分前缀和用户原文，导致 UI 中展示出「用户请求写作评分…」的指令残骸。

## 决策

**用 `<instruction>` XML tag 包裹评分意图前缀。**

```
<instruction>用户请求写作评分，请评分并调用 evaluate_writing 工具保存。</instruction>
{用户原文}
```

### 过滤位置

`readSessionMessages()` 在解析 jsonl 中 `role: 'user'` 的消息时，识别并剥离 `<instruction>...</instruction>` 包裹的内容，只保留之后的用户原文。

### 为什么选 `<instruction>`

- 语义准确：这是一条给 Agent 的指令，不是 system prompt，不是用户输入
- 与 pi-subagents 的 `<agent_instructions>` 命名风格一致
- 正常用户不会在消息开头写 `<instruction>`，误杀概率极低
- 即使用户故意写了，也属于注入行为，本地单机版本无需做越狱防护

### 不做前端过滤

`readSessionMessages()` 是唯一需要感知 `<instruction>` 的地方。SSE 实时流直接透传 pi SDK 事件，不在 fitword 层改写消息（参见 ADR 0013）。

### 不换用 system prompt 追加

`appendSystemPromptOverride` 在每次 LLM 调用时全局追加，不适合「仅本次请求触发评分」的临时指令。最终选择在 user message 层面标注，范围精准、实现简单。

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| 裸文本前缀（当前） | 零实现成本 | 历史消息泄漏指令 |
| `<instruction>` tag | 简单，可过滤 | 需修改拼接和解析两处 |
| 追加 system prompt | 不污染 user message | 影响整个 session 的后续请求 |
| 独立 `customMessage` | 天然隔离 | pi SDK 的 `CustomAgentMessages` 需声明合并，复杂度过高 |

## 后果

- `pi-agent.ts` 中评分意图拼接改为 `<instruction>...</instruction>\n{原文}` 格式
- `readSessionMessages()` 新增 tag 剥离逻辑
- 若未来有其他需要前端隐藏的指令，复用 `<instruction>` 或引入其他 tag 即可
