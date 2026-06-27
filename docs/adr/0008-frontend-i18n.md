# ADR 0008: 前端 i18n 使用 Lingui

## 背景

fitword 的 Web UI 需要支持中文和英文界面文案。练习内容、题目、评分和反馈由 Agent 根据用户对话生成，不属于 UI catalog 的职责；UI catalog 只管理按钮、导航、空状态、提示、统计页等前端静态文案。

参考项目 `roundtable` 已经使用 Lingui 管理 React UI 多语言。fitword 采用同一套 i18n 约定，可以减少多项目之间的维护差异。

## 决策

使用 Lingui 管理前端 UI 文案。

具体约定：

1. `zh-CN` 是 source locale 和默认界面语言，另支持 `en`。
2. Lingui catalog 放在 `src/locales/{locale}/messages.po`，编译产物由 Lingui 生成。
3. React UI 中的可见静态文案通过 Lingui macro 提取。
4. 前端启动时读取 `localStorage` 中的 `fitword.locale`；无有效值时使用 `zh-CN`。
5. 切换语言只影响工作台 UI，不改变 Agent 生成练习内容时使用的语言。
6. BDD/E2E 测试策略不写入本 ADR；相关决策见 ADR 0015。

## 备选方案

| 方案          | 优点                                                  | 缺点                                             |
| ------------- | ----------------------------------------------------- | ------------------------------------------------ |
| Lingui        | 支持 catalog 提取、编译和 React macro；与参考项目一致 | 增加 i18n 构建步骤和 catalog 维护成本            |
| 手写翻译对象  | 依赖少，实现直接                                      | 缺少提取、缺失检查和翻译文件上下文，文案容易漂移 |
| 只保留中文 UI | 初期成本最低                                          | 无法覆盖英文界面需求，也无法验证语言切换行为     |

## 后果

- 新增或修改 UI 文案后运行 `pnpm run i18n:extract`，并补齐非源语言翻译。
- 发布或构建前需要确保 Lingui catalog 可编译。
- UI 静态文案走 catalog，Agent 生成内容不进入 catalog。
- 语言切换测试只验证 UI 文案和设置行为，不验证 Agent 输出语言。
