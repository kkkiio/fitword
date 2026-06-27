import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { KnowledgeType, Quality, QuestionFormat, ScoreCard, SessionInfo } from '../shared/types.js';

export const fitwordDataDir = process.env.FITWORD_DATA_DIR?.trim() || path.join(os.homedir(), '.fitword');
export const fitwordSessionDir = path.join(fitwordDataDir, 'sessions');

fs.mkdirSync(fitwordSessionDir, { recursive: true });

export const db = new Database(process.env.FITWORD_DB?.trim() || path.join(fitwordDataDir, 'fitword.db'));

db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(path.resolve(process.cwd(), 'db/schema.sql'), 'utf8'));

export function createSessionFromFirstMessage(firstMessage: string) {
  const normalizedTitle = firstMessage.replace(/\s+/g, ' ').trim().slice(0, 20) || '新对话';
  const now = new Date().toISOString();
  const id = randomUUID();
  const session: SessionInfo = {
    id,
    title: normalizedTitle,
    status: 'active',
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `INSERT INTO sessions (id, title, status, created_at, updated_at)
     VALUES (@id, @title, @status, @created_at, @updated_at)`,
  ).run(session);

  return session;
}

export function getActiveSessions() {
  const rows = db
    .prepare(
      `SELECT id, title, status, created_at, updated_at
       FROM sessions
       WHERE status = 'active'
       ORDER BY updated_at DESC`,
    )
    .all() as SessionInfo[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export function getSession(sessionId: string) {
  const row = db
    .prepare(
      `SELECT id, title, status, created_at, updated_at
       FROM sessions
       WHERE id = ?`,
    )
    .get(sessionId) as SessionInfo | undefined;

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function touchSession(sessionId: string) {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE sessions
       SET updated_at = ?
       WHERE id = ? AND status = 'active'`,
    )
    .run(now, sessionId);

  if (result.changes === 0) {
    return undefined;
  }

  return getSession(sessionId);
}

export function archiveSession(sessionId: string) {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE sessions
       SET status = 'archived',
           updated_at = ?
       WHERE id = ? AND status = 'active'`,
    )
    .run(now, sessionId);

  return {
    ok: result.changes > 0,
  };
}

export function recordAnswer(input: {
  format: QuestionFormat;
  question: string;
  knowledge_type: KnowledgeType;
  topic_tag?: string;
  user_answer: string;
  quality: Quality;
  candidates?: string[];
  correct?: string;
}) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const question = db
      .prepare(
        `INSERT INTO questions
           (format, knowledge_type, question_text, candidates, correct_answer, topic_tag, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.format,
        input.knowledge_type,
        input.question,
        input.candidates ? JSON.stringify(input.candidates) : null,
        input.correct ?? null,
        input.topic_tag ?? null,
        now,
      );

    db.prepare(
      `INSERT INTO answers
         (question_id, user_answer, quality, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(question.lastInsertRowid, input.user_answer, input.quality, now);

    return {
      question_id: question.lastInsertRowid,
    };
  })();
}

export function saveScore(card: ScoreCard) {
  const dimensions = card.dimensions;
  const result = db
    .prepare(
      `INSERT INTO scoring_records
         (original_text, total_score, accuracy, specificity, naturalness, structure,
          register, main_issues, suggestions, rewrite, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      card.original_text,
      card.total_score,
      dimensions.accuracy,
      dimensions.specificity,
      dimensions.naturalness,
      dimensions.structure,
      dimensions.register,
      card.main_issues,
      JSON.stringify(card.suggestions),
      card.rewrite,
      new Date().toISOString(),
    );

  return Number(result.lastInsertRowid);
}

export function getStats() {
  const emptyOverall = {
    total: 0,
    usable: 0,
    good: 0,
    needs_work: 0,
    usable_rate: 0,
    good_rate: 0,
    needs_work_rate: 0,
  };
  const overallRow = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN quality >= 1 THEN 1 ELSE 0 END) AS usable,
              SUM(CASE WHEN quality = 2 THEN 1 ELSE 0 END) AS good,
              SUM(CASE WHEN quality < 2 THEN 1 ELSE 0 END) AS needs_work
       FROM answers`,
    )
    .get() as { total: number; usable: number | null; good: number | null; needs_work: number | null };
  const total = overallRow.total ?? 0;
  const usable = overallRow.usable ?? 0;
  const good = overallRow.good ?? 0;
  const needsWork = overallRow.needs_work ?? 0;
  const overall = total
    ? {
        total,
        usable,
        good,
        needs_work: needsWork,
        usable_rate: Math.round((usable * 1000) / total) / 10,
        good_rate: Math.round((good * 1000) / total) / 10,
        needs_work_rate: Math.round((needsWork * 1000) / total) / 10,
      }
    : emptyOverall;
  const aggregateSelect = `
    COUNT(*) AS total,
    SUM(CASE WHEN a.quality >= 1 THEN 1 ELSE 0 END) AS usable,
    SUM(CASE WHEN a.quality = 2 THEN 1 ELSE 0 END) AS good,
    SUM(CASE WHEN a.quality < 2 THEN 1 ELSE 0 END) AS needs_work,
    ROUND(SUM(CASE WHEN a.quality >= 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS usable_rate,
    ROUND(SUM(CASE WHEN a.quality = 2 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS good_rate,
    ROUND(SUM(CASE WHEN a.quality < 2 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS needs_work_rate`;
  const weakTypes = db
    .prepare(
      `SELECT q.knowledge_type, ${aggregateSelect}
       FROM answers a JOIN questions q ON a.question_id = q.id
       GROUP BY q.knowledge_type
       ORDER BY good_rate ASC, usable_rate ASC`,
    )
    .all();
  const formatComparison = db
    .prepare(
      `SELECT q.format, ${aggregateSelect}
       FROM answers a JOIN questions q ON a.question_id = q.id
       GROUP BY q.format`,
    )
    .all();
  const topicDistribution = db
    .prepare(
      `SELECT topic_tag, COUNT(*) AS total
       FROM questions
       WHERE topic_tag IS NOT NULL
       GROUP BY topic_tag
       ORDER BY total DESC`,
    )
    .all();
  const writingSummary = db
    .prepare(
      `SELECT COUNT(*) AS total_records,
              ROUND(AVG(total_score), 1) AS average_total_score,
              ROUND(AVG(accuracy), 1) AS average_accuracy,
              ROUND(AVG(specificity), 1) AS average_specificity,
              ROUND(AVG(naturalness), 1) AS average_naturalness,
              ROUND(AVG(structure), 1) AS average_structure,
              ROUND(AVG(register), 1) AS average_register
       FROM scoring_records`,
    )
    .get();

  return {
    overall,
    weak_types: weakTypes,
    format_comparison: formatComparison,
    topic_distribution: topicDistribution,
    writing_summary: writingSummary,
  };
}
