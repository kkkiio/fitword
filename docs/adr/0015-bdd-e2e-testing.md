# ADR 0015: BDD E2E 使用 Pi faux provider

## 背景

fitword 需要用端到端测试覆盖用户能真实操作的工作流：首屏、新建练习、语言切换、选择题、填空题、多对话切换、写作评分、统计页和本地持久化。出题与写作评分依赖 Agent 通过 Pi SDK 调用工具，例如 `ask_question`、`record_answer`、`evaluate_writing`。

直接在默认 BDD 中调用真实模型会让测试依赖外部服务、API key、网络和模型输出稳定性。恢复 `FITWORD_FORCE_DEMO` 或 Fitword 自己注入题卡、评分卡，又会绕过 Pi SDK 的 session、tool loop、SSE 事件和 jsonl 持久化，破坏 ADR 0013 的事件边界。

Pi 底层模型库 `@earendil-works/pi-ai` 提供官方 faux provider，可以脚本化返回 assistant text、thinking 和 tool call。它替换的是 LLM provider，不替换 Pi SDK Agent，也不替换 Fitword 的服务、工具、SSE 或持久化链路。

## 决策

使用 `playwright-bdd` 编写 BDD E2E 场景，并用中文 feature 描述用户行为。BDD 文案必须从用户视角表达可观察行为，不能写成“模型能力可用”“provider 返回成功”这类实现语言。

E2E fixture 启动真实本地 Hono 服务。每个场景使用独立临时数据目录和 SQLite 数据库，避免污染用户本地 `~/.fitword/` 数据。

引入 `FITWORD_LLM_PROVIDER` 选择 LLM provider：

| 值                  | 用途                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `openai-compatible` | 默认值。使用 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 注册 Fitword 的 OpenAI-compatible provider |
| `faux`              | 仅测试环境。使用 Pi 官方 faux provider 脚本化模型响应                                                       |

`faux` 只允许在 `NODE_ENV=test` 下启用。生产或日常本地使用必须走 `openai-compatible`，避免 faux provider 变成用户可见的 demo 功能。

BDD 场景分两类运行：

1. 不需要模型行为的场景使用 `local` fixture 模式，启动服务但清空 `OPENAI_*` 配置。
2. 需要模型行为的场景使用 `faux` fixture 模式，设置 `FITWORD_LLM_PROVIDER=faux`。

`faux` 响应脚本只能描述模型返回的 assistant message 和 tool call。它不能在 Fitword 层直接注入题卡、评分卡、业务数据或自定义 SSE 事件。服务仍通过 `createAgentSession` 创建 Pi session，仍由 Pi SDK 产生 `message_*`、`tool_execution_*`、`agent_end` 等事件，并继续写入 Pi jsonl。

真实 provider 兼容性不放进默认 BDD。需要验证真实模型服务时，使用 `real-llm` fixture 模式或人工专项测试，并显式提供 `FITWORD_LLM_PROVIDER=openai-compatible` 与 `OPENAI_*` 配置。

## 备选方案

| 方案                                    | 优点                                                             | 缺点                                                        |
| --------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| 默认 BDD 调真实模型                     | 最接近生产                                                       | 慢、贵、不稳定，CI 和本地都需要密钥与网络                   |
| 本地 mock OpenAI-compatible HTTP server | 保留 HTTP 协议层                                                 | 需要自己实现 streaming/tool-call 协议，测试重点偏离 Fitword |
| 恢复 Fitword demo/fallback 事件         | 实现快                                                           | 绕过 Pi SDK，产生不可重放事件，破坏 ADR 0013                |
| 只做组件测试                            | 反馈快                                                           | 覆盖不到真实服务、Pi session、SSE、SQLite 和 jsonl          |
| Pi 官方 faux provider                   | 不调用外部模型，同时保留 Pi SDK session、tool loop、SSE 和持久化 | 需要为 BDD 场景维护脚本化模型响应                           |

选择 Pi 官方 faux provider。

## 后果

- `@earendil-works/pi-ai` 是显式依赖，因为官方 faux provider 由该包提供。
- `pnpm run test:e2e` 默认不需要 `OPENAI_*`，需要模型行为的 BDD 通过 Pi faux provider 执行。
- BDD 中的选择题、填空题、答题、写作评分和统计聚合仍经过 Pi SDK tool call、SSE 事件、SQLite 写入和 jsonl 持久化链路。
- 测试脚本不能恢复 `FITWORD_FORCE_DEMO`，也不能新增绕过 Pi SDK 的 Fitword 私有事件路径。
- 修改 feature 后需要运行 `pnpm run bddgen`，`pnpm run test:e2e` 会执行 build、BDD 生成和 Playwright 测试。
