# ADR 0008: I18n and BDD E2E

## 状态

已采纳

## 背景

fitword 的 Web UI 已经具备对话、题卡、评分卡和统计页。后续改动需要可回归验证首屏、语言切换和基础练习流，同时 UI 文案需要支持中文和英文。

参考 `roundtable` 项目已经采用 Lingui 做 React UI 多语言，并用 `playwright-bdd` 写中文 Gherkin 场景。fitword 可以沿用这套约定，减少维护成本和测试风格分叉。

## 决策

1. 使用 Lingui 管理前端 UI 文案。
2. 默认语言为 `zh-CN`，同时支持 `en`。
3. Lingui catalog 放在 `src/locales/{locale}/messages.po`。
4. React UI 中的可见静态文案通过 Lingui macro 提取。
5. 使用 `playwright-bdd` 编写端到端测试，用中文 feature 描述行为。
6. e2e 测试启动真实本地 Hono 服务，但设置 `FITWORD_FORCE_DEMO=1`，避免调用真实 LLM。
7. e2e 测试使用独立临时 SQLite 数据库，避免污染用户本地数据。
8. 额外保留一个在线写作评分场景；只有 `.env` 或环境变量中存在 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 时启用，否则跳过。BDD 文本使用用户行为语言，模型服务细节保留在 fixture 和步骤实现中。

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| Lingui + playwright-bdd | 与参考项目一致；支持 catalog 提取；BDD 用例贴近产品语言 | 增加构建和测试依赖 |
| 手写翻译对象 + Playwright | 依赖更少 | 缺少提取/缺失检查，文案容易漂移 |
| 只做组件单测 | 快速 | 覆盖不到真实服务、静态构建和浏览器交互 |

## 后果

- 新增或修改 UI 文案后需要运行 `npm run i18n:extract` 并补齐非源语言翻译。
- e2e 测试需要先 `npm run bddgen` 生成 `.features-gen`。
- `npm run test:e2e` 会执行构建、BDD 生成和 Playwright 测试。
- 配置模型服务后，`npm run test:e2e` 会产生一次真实模型调用，用于验证 `evaluate_writing` 工具链路。
- 服务入口避免启动期静态加载 pi SDK Agent，健康检查和静态 UI 可以先启动。
