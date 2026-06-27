import { Given, Then, When, test } from '../support/fixtures';

Given('我还没有任何练习记录', async ({ fitword }) => {
  await fitword.start();
});

Given('我准备让表达教练出题', async ({ fitword }) => {
  test.setTimeout(60_000);
  await fitword.start({ mode: 'faux' });
});

Given('我准备让表达教练点评文字', async ({ fitword }) => {
  test.setTimeout(60_000);
  await fitword.start({ mode: 'faux' });
});

When('我打开 fitword', async ({ workspace }) => {
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

When('我填写答案 {string}', async ({ workspace }, answer: string) => {
  await workspace.fillAnswer(answer);
});

When('我新建一个空白对话', async ({ workspace }) => {
  await workspace.startEmptyConversation();
});

When('我切回对话 {string}', async ({ workspace }, title: string) => {
  await workspace.selectConversation(title);
});

When('我提交这段文字请求评分 {string}', async ({ workspace }, text: string) => {
  await workspace.submitWritingForScore(text);
});

When('我打开统计页', async ({ workspace }) => {
  await workspace.openStats();
});

Then('我能看到中文练习入口', async ({ workspace }) => {
  await workspace.expectChineseWorkspace();
});

Then('统计页提示暂无练习数据', async ({ workspace }) => {
  await workspace.expectEmptyStats();
});

Then('我能看到英文练习入口', async ({ workspace }) => {
  await workspace.expectEnglishWorkspace();
});

Then('我会收到一道包含候选词的选择题', async ({ workspace }) => {
  await workspace.expectChoiceQuestion();
});

Then('我会收到一道填空题', async ({ workspace }) => {
  await workspace.expectFillQuestion();
});

Then('我会看到反馈 {string}', async ({ workspace }, text: string) => {
  await workspace.expectFeedback(text);
});

Then('我能看到消息 {string}', async ({ workspace }, text: string) => {
  await workspace.expectMessage(text);
});

Then('我能看到写作评分结果', async ({ workspace }) => {
  await workspace.expectWritingScore();
});

Then('统计页显示 {int} 道题和 {int} 次写作评分', async ({ workspace }, questionTotal: number, writingTotal: number) => {
  await workspace.expectStatsSummary(questionTotal, writingTotal);
});

Then('统计页显示选择题和填空题都有记录', async ({ workspace }) => {
  await workspace.expectChoiceAndFillStats();
});
