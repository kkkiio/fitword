-- fitword SQLite schema

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  format TEXT NOT NULL CHECK (format IN ('choice', 'fill')),
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('noun', 'verb', 'adjective', 'logic', 'domain')),
  question_text TEXT NOT NULL,
  candidates TEXT,
  correct_answer TEXT,
  topic_tag TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  user_answer TEXT NOT NULL,
  quality INTEGER NOT NULL CHECK (quality IN (0, 1, 2)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scoring_records (
  id INTEGER PRIMARY KEY,
  original_text TEXT NOT NULL,
  total_score INTEGER NOT NULL CHECK (total_score BETWEEN 1 AND 5),
  accuracy INTEGER NOT NULL CHECK (accuracy BETWEEN 1 AND 5),
  specificity INTEGER NOT NULL CHECK (specificity BETWEEN 1 AND 5),
  naturalness INTEGER NOT NULL CHECK (naturalness BETWEEN 1 AND 5),
  structure INTEGER NOT NULL CHECK (structure BETWEEN 1 AND 5),
  register INTEGER NOT NULL CHECK (register BETWEEN 1 AND 5),
  main_issues TEXT NOT NULL,
  suggestions TEXT NOT NULL,
  rewrite TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
