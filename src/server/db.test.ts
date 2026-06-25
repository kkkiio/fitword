import { describe, expect, it } from 'vitest';
import { getStats, recordAnswer, saveScore } from './db.js';

describe('fitword storage and stats', () => {
  it('records answers and writing scores', () => {
    const before = getStats().overall.total;
    recordAnswer({
      format: 'choice',
      question: '项目第一阶段的开发已经____，下周进入测试。',
      knowledge_type: 'verb',
      topic_tag: '进度汇报',
      candidates: ['完成', '告一段落', '收尾', '结束'],
      correct: '告一段落',
      user_answer: '告一段落',
      quality: 2,
    });
    const id = saveScore({
      type: 'score',
      original_text: '本周完成了大部分开发任务，整体进度正常。',
      total_score: 3,
      dimensions: { accuracy: 4, specificity: 2, naturalness: 4, structure: 3, register: 4 },
      main_issues: '具体度偏弱',
      suggestions: [{ original: '大部分', replacement: '核心', reason: '更具体' }],
      rewrite: '本周完成了核心开发任务。',
    });
    const stats = getStats();
    expect(id).toBeGreaterThan(0);
    expect(stats.overall.total).toBe(before + 1);
    expect(stats.weak_types.some((row: any) => row.knowledge_type === 'verb')).toBe(true);
  });
});
