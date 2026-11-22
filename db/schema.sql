-- JLPT N2 practice database (SQLite, node:sqlite)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ───────────── content (rebuilt by scripts/build-db.js) ─────────────
CREATE TABLE IF NOT EXISTS exams (
  id            TEXT PRIMARY KEY,          -- '2024-07'
  title         TEXT NOT NULL,             -- 'JLPT N2 7/2024'
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL,
  question_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mondai (
  id            TEXT PRIMARY KEY,          -- '2024-07:01'
  exam_id       TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  no            INTEGER NOT NULL,          -- 問題 number 1..14
  section       TEXT NOT NULL,             -- vocab | grammar | reading
  instruction   TEXT NOT NULL,
  instruction_vi TEXT
);
CREATE INDEX IF NOT EXISTS idx_mondai_exam ON mondai(exam_id, no);

CREATE TABLE IF NOT EXISTS passages (
  id            TEXT PRIMARY KEY,          -- '2024-07:10:p1'
  mondai_id     TEXT NOT NULL REFERENCES mondai(id) ON DELETE CASCADE,
  pid           TEXT NOT NULL,             -- 'p1' | 'A' | 'B'
  label         TEXT,
  text          TEXT NOT NULL,
  ord           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id            TEXT PRIMARY KEY,          -- '2024-07:q01'
  exam_id       TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  mondai_id     TEXT NOT NULL REFERENCES mondai(id) ON DELETE CASCADE,
  num           INTEGER NOT NULL,          -- question number in the exam
  section       TEXT NOT NULL,
  passage_ref   TEXT,                      -- 'p1' | 'AB' | null
  stem          TEXT NOT NULL,
  options_json  TEXT NOT NULL,             -- ["..","..","..",".."]
  answer        INTEGER NOT NULL,          -- official answer 1..4 (from answer_key.json)
  explanation_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_q_exam ON questions(exam_id, num);

-- vocabulary mentioned in explanations (for the vocab review page)
CREATE TABLE IF NOT EXISTS vocab (
  word          TEXT NOT NULL,
  reading       TEXT,
  hanviet       TEXT,
  meaning       TEXT,
  question_id   TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  PRIMARY KEY (word, question_id)
);
CREATE INDEX IF NOT EXISTS idx_vocab_word ON vocab(word);

-- ───────────── dictionaries (kept across rebuilds) ─────────────
-- the learner's own N2 vocab list (priority 1), imported from data/vocab_list.json
CREATE TABLE IF NOT EXISTS user_vocab (
  word          TEXT PRIMARY KEY,
  reading       TEXT,
  hanviet       TEXT,
  meaning       TEXT,
  note          TEXT
);

-- Mazii lookups (priority 2), filled by scripts/enrich-mazii.js
CREATE TABLE IF NOT EXISTS mazii_cache (
  word          TEXT PRIMARY KEY,
  found         INTEGER NOT NULL,
  reading       TEXT,
  hanviet       TEXT,
  meaning       TEXT,
  fetched_at    TEXT NOT NULL
);

-- ───────────── learner progress (never wiped by rebuild) ─────────────
CREATE TABLE IF NOT EXISTS attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id       TEXT NOT NULL,
  mode          TEXT NOT NULL,             -- practice | exam
  sections      TEXT NOT NULL,             -- 'vocab,grammar,reading'
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  time_limit_sec INTEGER,
  elapsed_sec   INTEGER,
  score         INTEGER,
  total         INTEGER
);

CREATE TABLE IF NOT EXISTS attempt_answers (
  attempt_id    INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL,
  choice        INTEGER,                   -- 1..4, null = skipped
  is_correct    INTEGER,
  answered_at   TEXT NOT NULL,
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS flags (
  question_id   TEXT PRIMARY KEY,
  note          TEXT,
  created_at    TEXT NOT NULL
);
