import { describe, expect, it } from 'vitest';
import { FITWORD_SYSTEM_PROMPT } from './system-prompt.js';

describe('fitword system prompt', () => {
  it('infers the practice language from the user instead of hard-coding Chinese', () => {
    expect(FITWORD_SYSTEM_PROMPT).toContain('练习语言跟随用户当前表达');
    expect(FITWORD_SYSTEM_PROMPT).toContain('用户明确指定时按指定语言');
    expect(FITWORD_SYSTEM_PROMPT).toContain('题干和候选词使用练习语言');
    expect(FITWORD_SYSTEM_PROMPT).toContain('反馈使用用户更容易理解的语言');
    expect(FITWORD_SYSTEM_PROMPT).toContain('多语言混用且目标不清时，先问一句简短澄清问题');
  });

  it('requires questions to be shown only through ask_question cards', () => {
    expect(FITWORD_SYSTEM_PROMPT).toContain('当你决定出选择题');
    expect(FITWORD_SYSTEM_PROMPT).toContain('当你决定出填空题');
    expect(FITWORD_SYSTEM_PROMPT).toContain('必须用 ask_question 出题');
    expect(FITWORD_SYSTEM_PROMPT).toContain('调用 ask_question');
    expect(FITWORD_SYSTEM_PROMPT).toContain('"format": "choice"');
    expect(FITWORD_SYSTEM_PROMPT).toContain('"format": "fill"');
    expect(FITWORD_SYSTEM_PROMPT).toContain('```json');
    expect(FITWORD_SYSTEM_PROMPT).toContain('不要在普通文本里列出 A/B/C/D、完整题干');
    expect(FITWORD_SYSTEM_PROMPT).toContain('不要在普通文本里写出完整填空句');
    expect(FITWORD_SYSTEM_PROMPT).toContain('不要在工具调用前后复述题目、选项或留空句');
  });

  it('records choice answers in ask_question and fill answers through record_answer', () => {
    expect(FITWORD_SYSTEM_PROMPT).toContain('ask_question 返回 user_answer 和 quality 后，说明用户已经作答');
    expect(FITWORD_SYSTEM_PROMPT).toContain('选择题记录也已经保存');
    expect(FITWORD_SYSTEM_PROMPT).toContain('不要调用 record_answer');
    expect(FITWORD_SYSTEM_PROMPT).toContain('ask_question 返回 user_answer 后，说明用户已经作答');
    expect(FITWORD_SYSTEM_PROMPT).toContain('先根据答案语义判断 quality，再用 record_answer 写入记录');
    expect(FITWORD_SYSTEM_PROMPT).toContain('"user_answer": "<用户填写>"');
  });
});
