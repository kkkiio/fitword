# ADR 0003: Agent 工具设计

## 背景

fitword 的练习交互采用 chatbot + 工具调用模式。Agent 负责生成题目内容和反馈，工具负责展示题目、收集用户输入、写入存储。需要定义每个工具的边界、参数、返回值和副作用。

## 工具清单

仅注册 fitword 自有工具。pi SDK 内置工具（read、bash、edit、write）禁用。

| 工具 | 职责 |
|---|---|
| `ask_question` | 展示题目 + 收集用户答案 + 选择题机械判定答题质量 |
| `record_answer` | 写入答题记录（含答题质量） |
| `evaluate_writing` | 展示写作评分卡片 + 写入评分记录 |
| `get_practice_stats` | 查询用户练习统计数据 |

## 工具职责边界

Agent 产出内容，工具只管：**展示 → 收集 → 存储**。工具不调 LLM，不做开放语义判断。

选择题是确定性判定：Agent 提交题目、候选项和正确答案后，`ask_question` 可直接将用户选择与 `correct` 做机械比较并返回 `quality`。选择题选对记为 `2`，选错记为 `0`，不产生 `1`。填空题和写作评分仍由 Agent 进行语义判断。

题目答题写入存储统一由 `record_answer` 负责，`ask_question` 不写 DB。原因：
- 填空题无法在收集答案时判定质量——Agent 需要在拿到用户输入后做语义判断
- 选择题虽然可在收集答案时机械判定，但仍统一通过 `record_answer` 写入，避免展示/收集工具产生存储副作用

questions 表只保存已完成作答的题目。未作答题目不进入业务数据库；当前对话中的临时题目状态由会话上下文承载。

写作评分记录由 `evaluate_writing` 负责写入，因为评分内容已经由 Agent 生成，工具只做展示和存储。

---

## ask_question — 出题工具

Agent 生成题目后调用，向用户呈现选择题或填空题，收集答案后返回。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `format` | `"choice"` \| `"fill"` | 是 | 题目格式 |
| `question` | string | 是 | 题目文本，留空位置用 `____` 占位 |
| `knowledge_type` | `"noun"` \| `"verb"` \| `"adjective"` \| `"logic"` \| `"domain"` | 是 | 知识类别 |
| `topic_tag` | string | 否 | 话题标签 |

**仅选择题额外参数：**

| 参数 | 类型 | 说明 |
|---|---|---|
| `candidates` | string[] | 4 个候选词 |
| `correct` | string | 正确答案 |

填空题无额外参数。

### 行为

1. UI 按 `____` 分割 `question` 渲染题目。选择题渲染 4 按钮，填空题渲染输入框。
2. 等待用户作答。
3. 选择题将用户选择与 `correct` 做机械比较，得到 `quality`；填空题不判定。
4. 收集完成后以 tool result 形式返回。
5. 不写存储。

### 返回值

填空题返回：

```json
{ "user_answer": "顺延" }
```

选择题返回：

```json
{ "user_answer": "告一段落", "quality": 2 }
```

---

## record_answer — 答题记录工具

Agent 在获得用户答案和答题质量后调用，写入 SQLite。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `format` | `"choice"` \| `"fill"` | 是 | 与 ask_question 一致 |
| `question` | string | 是 | 题目全文 |
| `knowledge_type` | string | 是 | 知识类别 |
| `topic_tag` | string | 否 | 话题标签 |
| `user_answer` | string | 是 | 用户答案 |
| `quality` | `0` \| `1` \| `2` | 是 | 三档答题质量。`0` 表示不可用，`1` 表示可用但不佳，`2` 表示好。选择题来自 `ask_question` 的机械判定，只会产生 `0` 或 `2`；填空题来自 Agent 的语义判断，可产生三档 |

**仅选择题额外参数：**

| 参数 | 类型 | 说明 |
|---|---|---|
| `candidates` | string[] | 候选词列表 |
| `correct` | string | 正确答案 |

### 行为

写入 SQLite `questions` 和 `answers` 表。两张表写入在同一事务中，因此只保存已经完成作答的题目。

### 完整流程

```
选择题:
  Agent → ask_question(question, candidates, correct) → 展示
        → 用户选 → 工具用 correct 机械判定 → 返回 { user_answer, quality }
        → record_answer(quality=0/2)
        → Agent 给选项辨析

填空题:
  Agent → ask_question(question) → 展示
        → 用户输入 → 返回 { user_answer }
        → Agent 语义判断 → record_answer(quality=0/1/2)
        → Agent 给评价反馈
```

---

## evaluate_writing — 写作评分工具

用户以写作评分意图提交文字后，Agent 分析并调用此工具展示和存储评分结果。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `original_text` | string | 是 | 用户原始文字 |
| `total_score` | number | 是 | 总分 1-5 |
| `dimensions` | `{ accuracy, specificity, naturalness, structure, register }` | 是 | 各维度 1-5 |
| `main_issues` | string | 是 | 主要问题描述 |
| `suggestions` | `{ original, replacement, reason }[]` | 是 | 可替换词建议 2-3 条 |
| `rewrite` | string | 是 | 改写版本全文 |

### 行为

1. UI 渲染评分卡片。
2. 评分数据写入 SQLite `scoring_records` 表。

### 返回值

```json
{ "scoring_record_id": 12 }
```

---

## get_practice_stats — 统计查询工具

Agent 查询用户练习数据，用于 Agent Memory。

### 参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `query` | `"weak_types"` \| `"topic_distribution"` \| `"overall"` \| `"format_comparison"` \| `"writing_summary"` | 查询类型 |

### 行为

从 SQLite 查询聚合数据，无副作用。

### 返回值

```json
{
  "weak_types": [
    { "knowledge_type": "adjective", "total": 10, "usable": 7, "good": 4, "needs_work": 6, "usable_rate": 70.0, "good_rate": 40.0, "needs_work_rate": 60.0 }
  ],
  "overall": { "total_questions": 35, "usable_rate": 82.9, "good_rate": 62.9, "needs_work_rate": 37.1 },
  "writing_summary": { "total_records": 4, "average_total_score": 3.5 }
}
```

Agent 在对话中自然引用，不主动输出完整统计面板。完整统计由 UI 的统计页只读展示。

---

## `____` 占位符

题目文本中使用 `____` 标记留空位置。v0.1 仅支持一个留空。UI 按 `____` 分割渲染。

```
question: "项目开发已经____，下周进入测试。"
UI:      项目开发已经 [ 输入组件 ] ，下周进入测试。
```

---

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| ask_question 同时写存储 | 少一个工具 | 填空题无法在收集时判定质量，被迫用 NULL 占位 |
| 填空题传 expected/acceptable | 工具可做自动判定 | 限制 Agent 灵活判断 |
| 每个题型独立工具 | 参数更精确 | 工具数量膨胀 |

## 后果

- 4 个工具，职责清晰单向：展示/收集、写入、展示卡片、查询
- 选择题答题质量由 `ask_question` 基于 Agent 提供的正确答案机械判定，正确为 `2`，错误为 `0`
- 填空题评判完全依赖 Agent 语义能力
- 填空题的 `ask_question` 和 `record_answer` 分两阶段，中间保留 Agent 判断窗口
- 写作评分由 Agent 生成内容，`evaluate_writing` 负责展示并写入 `scoring_records`
