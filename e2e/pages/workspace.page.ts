import { expect, type Page } from '@playwright/test';

import type { FitwordE2eApp } from '../support/fitword-app';

export class FitwordWorkspacePage {
  private readonly page: Page;
  private readonly app: FitwordE2eApp;

  constructor(page: Page, app: FitwordE2eApp) {
    this.page = page;
    this.app = app;
  }

  async open(): Promise<void> {
    await this.page.goto(this.app.baseUrl);
    await expect(this.page.locator('aside').getByRole('heading', { name: 'fitword', exact: true })).toBeVisible();
    await expect(this.page.getByPlaceholder('输入你的消息…')).toBeVisible();
  }

  async expectChineseWorkspace(): Promise<void> {
    await expect(this.page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(this.page.getByText('词感 · 表达练习')).toBeVisible();
    await expect(this.page.getByRole('button', { name: /对话/ })).toBeVisible();
    await expect(this.page.getByRole('button', { name: /统计/ })).toBeVisible();
    await expect(this.page.getByText('你好，我是 fitword（词感）。')).toBeVisible();
    await expect(this.page.getByPlaceholder('输入你的消息…')).toBeVisible();
    await expect(this.page.getByText('写作评分')).toBeVisible();
    await expect(this.page.getByRole('button', { name: /发送/ })).toBeVisible();
  }

  async expectEmptyStats(): Promise<void> {
    await this.page.getByRole('button', { name: /统计/ }).click();
    await expect(this.page.getByRole('heading', { name: '练习统计', exact: true })).toBeVisible();
    await expect(this.page.getByText('总题数')).toBeVisible();
    await expect(this.page.getByText('暂无数据，完成练习后会显示。')).toHaveCount(2);
    await expect(this.page.getByText('总记录 0 次')).toBeVisible();
  }

  async switchToEnglish(): Promise<void> {
    await this.page.getByRole('button', { name: 'EN' }).click();
    await expect(this.page.locator('html')).toHaveAttribute('lang', 'en');
  }

  async expectEnglishWorkspace(): Promise<void> {
    await expect(this.page.getByText('Expression practice')).toBeVisible();
    await expect(this.page.getByRole('button', { name: /Chat/ })).toBeVisible();
    await expect(this.page.getByRole('button', { name: /Stats/ })).toBeVisible();
    await expect(this.page.getByText('Hi, I am fitword')).toBeVisible();
    await expect(this.page.getByPlaceholder('Enter your message...')).toBeVisible();
    await expect(this.page.getByText('Writing score')).toBeVisible();
    await expect(this.page.getByRole('button', { name: /Send/ })).toBeVisible();
  }

  async sendPracticeMessage(message: string): Promise<void> {
    await this.page.getByRole('button', { name: /对话/ }).click();
    await this.page.getByPlaceholder('输入你的消息…').fill(message);
    await this.page.getByRole('button', { name: /发送/ }).click();
  }

  async expectChoiceQuestion(): Promise<void> {
    await expect(this.page.getByText('选择题')).toBeVisible();
    await expect(this.page.getByText('答完后我会给出语境适配度和表达差异。')).toBeVisible();
    await expect(this.page.getByRole('button', { name: /告一段落/ })).toBeVisible();
  }

  async chooseCandidate(candidate: string): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(candidate) }).click();
  }

  async expectFeedback(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible();
  }

  async submitWritingForScore(text: string): Promise<void> {
    await this.page.getByRole('button', { name: /对话/ }).click();
    await this.page.getByRole('switch').click();
    await this.page.getByPlaceholder('粘贴需要评分的文字…').fill(text);
    await this.page.getByRole('button', { name: /发送/ }).click();
  }

  async expectWritingScore(): Promise<void> {
    await expect(this.page.getByText('写作评分').first()).toBeVisible({ timeout: 90_000 });
    await expect(this.page.getByText('准确度')).toBeVisible();
    await expect(this.page.getByText('具体度')).toBeVisible();
    await expect(this.page.getByText('自然度')).toBeVisible();
    await expect(this.page.locator('blockquote')).toBeVisible();
  }
}
