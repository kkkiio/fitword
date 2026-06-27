import { Given, Then, When, test } from '../support/fixtures';
import { missingRealLlmConfig } from '../support/fitword-app';

Given('我从一个空白的练习工作台开始', async ({ fitword }) => {
  await fitword.start();
});

Given('表达教练可以提供模型能力', async ({ fitword }) => {
  const missing = missingRealLlmConfig();
  test.skip(missing.length > 0, `.env 或环境变量缺少模型配置：${missing.join(', ')}`);
  test.setTimeout(120_000);
  await fitword.start({ mode: 'real-llm' });
});

Given('表达教练可以提供在线评分', async ({ fitword }) => {
  const missing = missingRealLlmConfig();
  test.skip(missing.length > 0, `.env 或环境变量缺少在线评分配置：${missing.join(', ')}`);
  test.setTimeout(120_000);
  await fitword.start({ mode: 'real-llm' });
});

When('我进入练习工作台', async ({ workspace }) => {
  await workspace.open();
});

When('我把界面语言切换为英文', async ({ workspace }) => {
  await workspace.switchToEnglish();
});

When('我提出想练 {string}', async ({ workspace }, topic: string) => {
  await workspace.sendPracticeMessage(`想练${topic}`);
});

When('我选择候选词 {string}', async ({ workspace }, candidate: string) => {
  await workspace.chooseCandidate(candidate);
});

When('我提交这段文字请求评分 {string}', async ({ workspace }, text: string) => {
  await workspace.submitWritingForScore(text);
});

Then('我能看到中文练习入口', async ({ workspace }) => {
  await workspace.expectChineseWorkspace();
});

Then('我能看到还没有练习记录', async ({ workspace }) => {
  await workspace.expectEmptyStats();
});

Then('我能看到英文练习入口', async ({ workspace }) => {
  await workspace.expectEnglishWorkspace();
});

Then('我会收到一道选择题', async ({ workspace }) => {
  await workspace.expectChoiceQuestion();
});

Then('我会看到反馈 {string}', async ({ workspace }, text: string) => {
  await workspace.expectFeedback(text);
});

Then('我能看到写作评分结果', async ({ workspace }) => {
  await workspace.expectWritingScore();
});
