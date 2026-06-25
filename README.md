# fitword（词感）

fitword 是一个本地运行的中文表达练习工具，通过选择题、填空题和写作评分，帮助你把“被动词汇”转化为“主动词汇”。它以 chatbot 对话为主线：你可以自然描述想练的话题，系统会出题、收集答案、给出反馈，并把练习记录保存到本地。

## 功能

- **对话式练习**：围绕用户输入的话题生成选择题或填空题，前后端通过 SSE 流式传输 Agent 文本和工具卡片。
- **选择题**：4 个候选词中选出最贴切的词，系统机械判定正确 / 错误并记录质量。
- **填空题**：用户主动输入答案，训练真实表达中的词汇调用能力。
- **写作评分**：粘贴一段文字，获得总分、准确度、具体度、自然度、结构、语域五维评分，以及替换建议和改写版本。
- **本地统计页**：展示总题数、可用率、优质率、待打磨率、薄弱知识类别、选择题 vs 填空题表现，以及写作评分概览。
- **本地持久化**：业务数据保存到 `~/.fitword/fitword.db`，会话目录预留在 `~/.fitword/sessions/`。

## 安装

要求：Node.js >= 20.6、npm。

```bash
npm install
```

## 开发运行

本地开发可以在项目根目录创建 `.env`：

```bash
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
```

Fitword 会把这三个变量作为统一的 OpenAI-compatible LLM 配置传给 Pi SDK。`OPENAI_BASE_URL` 可指向 DeepSeek 等兼容 OpenAI Chat Completions 的服务。

```bash
npm run dev
```

启动后访问终端输出的 localhost 地址（默认 `http://localhost:5174`）。后端使用 Pi SDK Agent 会话；如本地尚未配置模型 API key，或 LLM 配置缺少必要变量，会在开发环境中返回本地演示流，便于验证 UI 与存储链路。

## 构建与校验

```bash
npm run typecheck
npm run test
npm run build
```

## 使用方式

1. 打开“对话”页，输入想练的场景，例如“最近写周报总觉得用词太干了”。
2. 系统会在聊天中呈现题目卡片：选择题可直接点击选项，填空题可输入答案。
3. 点击“提交评分”后，输入框会切换为评分模式；粘贴待评价文字并提交，即可获得评分卡片。
4. 打开“统计”页，可查看本地练习数据的只读统计。

## 数据位置

- 业务数据：`~/.fitword/fitword.db`
- 会话数据目录：`~/.fitword/sessions/`
