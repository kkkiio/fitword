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
    await expect(this.page.getByRole('heading', { name: 'fitword', exact: true }).first()).toBeVisible();
    await expect(this.page.getByPlaceholder('输入你的消息…')).toBeVisible();
  }

  async expectChineseWorkspace(): Promise<void> {
    await expect(this.page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(this.page.getByText('词感 · 表达练习').first()).toBeVisible();
    await expect(this.page.getByText('对话', { exact: true }).first()).toBeVisible();
    await expect(this.page.getByRole('button', { name: /统计/ })).toBeVisible();
    await expect(this.page.getByRole('button', { name: /新建对话/ }).first()).toBeVisible();
    await expect(this.page.getByPlaceholder('输入你的消息…')).toBeVisible();
  }

  async expectEmptyStats(): Promise<void> {
    await this.page.getByRole('button', { name: /统计/ }).click();
    await expect(this.page.getByRole('heading', { name: '练习统计', exact: true })).toBeVisible();
    await expect(this.page.getByText('答题概览')).toBeVisible();
    await expect(this.page.getByText('暂无答题数据，完成练习后会显示概览。')).toBeVisible();
    await expect(this.page.getByText('暂无题型数据。')).toBeVisible();
    await expect(this.page.getByText('暂无写作评分数据，完成评分后会显示五维平均分。')).toBeVisible();
  }

  async switchToEnglish(): Promise<void> {
    await this.page.getByRole('button', { name: '设置' }).click();
    await this.page.getByRole('button', { name: 'English' }).click();
    await expect(this.page.locator('html')).toHaveAttribute('lang', 'en');
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('dialog', { name: '设置' })).toBeHidden();
  }

  async expectEnglishWorkspace(): Promise<void> {
    await expect(this.page.getByText('Expression practice').first()).toBeVisible();
    await expect(this.page.getByText('Chat')).toBeVisible();
    await expect(this.page.getByRole('button', { name: /Stats/ })).toBeVisible();
    await expect(this.page.getByRole('button', { name: /New conversation/ }).first()).toBeVisible();
    await expect(this.page.getByPlaceholder('Enter your message...')).toBeVisible();
  }

  async sendPracticeMessage(message: string): Promise<void> {
    await this.page.getByPlaceholder('输入你的消息…').fill(message);
    await this.page.getByRole('button', { name: /发送/ }).click();
  }

  async expectChoiceQuestion(): Promise<void> {
    await expect(this.page.getByText('选择题')).toBeVisible({ timeout: 90_000 });
    await expect(this.page.getByText('答完后我会给出语境适配度和表达差异。')).toBeVisible();
    await expect(this.page.locator('button').filter({ hasText: /[A-D]/ }).first()).toBeVisible();
  }

  async chooseCandidate(candidate: string): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(candidate) }).click();
  }

  async expectFeedback(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible();
  }

  async submitWritingForScore(text: string): Promise<void> {
    const scoreSwitch = this.page.getByRole('switch');
    await scoreSwitch.click();
    await expect(scoreSwitch).toBeChecked();
    await this.page.locator('textarea[name="message"]').fill(text);
    await this.page.getByRole('button', { name: /发送/ }).click();
  }

  async expectWritingScore(): Promise<void> {
    await expect(this.page.getByText('准确度', { exact: true }).last()).toBeVisible({ timeout: 90_000 });
    await expect(this.page.getByText('写作评分').first()).toBeVisible();
    await expect(this.page.getByText('具体度', { exact: true }).last()).toBeVisible();
    await expect(this.page.getByText('自然度', { exact: true }).last()).toBeVisible();
    await expect(this.page.locator('blockquote.border-amber-500')).toBeVisible();
  }
}
