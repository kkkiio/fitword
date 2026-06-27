# fitword（词感）

fitword 是一个本地运行的表达练习工具，通过选择题、填空题和写作评分，帮助你把“被动词汇”转化为“主动词汇”。它以 chatbot 对话为主线：你可以自然描述想练的话题，系统会根据你的交流语言和明确要求出题、收集答案、给出反馈，并把练习记录保存到本地。

## 功能

- **对话式练习**：围绕用户输入的话题生成选择题或填空题，前后端通过 SSE 流式传输 Agent 文本和工具卡片。
- **选择题**：4 个候选词中选出最贴切的词，系统机械判定正确 / 错误并记录质量。
- **填空题**：用户主动输入答案，训练真实表达中的词汇调用能力。
- **写作评分**：粘贴一段文字，获得总分、准确度、具体度、自然度、结构、语域五维评分，以及替换建议和改写版本。
- **多对话持久化**：首条消息会自动创建一个 session；侧边栏按最近活跃时间展示对话，刷新后可恢复历史，也可归档不再显示。
- **本地统计页**：轻量展示答题概览和写作评分概览，便于确认本地练习记录持续累积。
- **语言自适应练习**：练习内容由 Agent 根据用户交流语言、输入内容和明确要求生成；工作台 UI 支持中文和英文切换，但不强行决定练习语言。
- **本地持久化**：业务数据保存到 `~/.fitword/fitword.db`，对话历史保存为 `~/.fitword/sessions/*.jsonl`。

## 安装

要求：Node.js >= 22.19.0、pnpm 10.34.4。

```bash
corepack enable
corepack prepare pnpm@10.34.4 --activate
pnpm install
```

## 运行

在项目根目录创建 `.env`，配置可用的 OpenAI-compatible 模型服务：

```bash
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
```

Fitword 会把这三个变量作为统一的 OpenAI-compatible LLM 配置传给 Pi SDK。`OPENAI_BASE_URL` 可指向 DeepSeek 等兼容 OpenAI Chat Completions 的服务。

```bash
pnpm run dev
```

如果本机安装了 `just`，也可以使用：

```bash
just run
```

启动后访问终端输出的 localhost 地址（默认 `http://localhost:5174`）。Fitword 需要可用的模型配置才能进行对话、出题和写作评分。

## 常用开发命令

```bash
just fmt
just gen
just check
just test
just e2e
just build
just run
```

## 使用方式

1. 在空白对话输入想练的场景，例如“最近写周报总觉得用词太干了”或 “I want to practice workplace adjectives”；首条消息发送后会自动创建 session。
2. 系统会在聊天中呈现题目卡片：选择题可直接点击选项，填空题可输入答案。
3. 打开“写作评分”开关后，输入框会切换为评分模式；粘贴待评价文字并发送，即可获得评分卡片。
4. 通过侧边栏的对话列表切换历史 session；点击“+”只进入空白对话，不会提前创建 session。
5. 通过侧边栏底部的设置按钮切换工作台界面语言；打开“统计”页可查看本地练习数据的只读统计。

## 数据位置

- 业务数据：`~/.fitword/fitword.db`
- 对话历史：`~/.fitword/sessions/*.jsonl`
