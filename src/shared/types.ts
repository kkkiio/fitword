export type QuestionFormat = 'choice' | 'fill';
export type KnowledgeType = 'noun' | 'verb' | 'adjective' | 'logic' | 'domain';
export type Quality = 0 | 1 | 2;
export type SessionStatus = 'active' | 'archived';

export interface SessionInfo {
  id: string;
  title: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface QuestionCard {
  type: 'question';
  id: string;
  format: QuestionFormat;
  question: string;
  knowledge_type: KnowledgeType;
  topic_tag?: string;
  candidates?: string[];
  correct?: string;
}

export interface ScoreSuggestion {
  original: string;
  replacement: string;
  reason: string;
}

export interface ScoreCard {
  type: 'score';
  scoring_record_id?: number;
  original_text: string;
  total_score: number;
  dimensions: {
    accuracy: number;
    specificity: number;
    naturalness: number;
    structure: number;
    register: number;
  };
  main_issues: string;
  suggestions: ScoreSuggestion[];
  rewrite: string;
}

export type ChatPart = { kind: 'text'; text: string } | { kind: 'question'; card: QuestionCard } | { kind: 'score'; card: ScoreCard };

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  parts: ChatPart[];
  created_at: string;
}

export interface StatsRow {
  total: number;
  usable: number;
  good: number;
  needs_work: number;
  usable_rate: number;
  good_rate: number;
  needs_work_rate: number;
}
