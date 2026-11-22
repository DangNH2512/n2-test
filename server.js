#!/usr/bin/env node
'use strict';
// JLPT N2 practice — local server. Zero npm dependencies (Node >= 22.5, node:sqlite).
// Usage: node server.js   → http://localhost:5173
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, openDb, tx } = require('./scripts/lib/db');

const PORT = Number(process.env.PORT) || 5173;
const PUBLIC = path.join(ROOT, 'public');
const db = openDb();
const now = () => new Date().toISOString();

// Official N2 timing: 言語知識(文字・語彙・文法)・読解 = 105 min for the whole paper.
// Per-section estimate used when only some sections are selected.
const SECTION_MIN = { vocab: 30, grammar: 25, reading: 50 };
const SECTION_LABEL = { vocab: '文字・語彙', grammar: '文法', reading: '読解' };

// ───────────── helpers ─────────────
function send(res, code, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(data);
}
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => {
      s += c;
      if (s.length > 2e6) { reject(new HttpError(413, 'body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try {
        const v = s ? JSON.parse(s) : {};
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch { reject(new HttpError(400, 'invalid JSON')); }
    });
    req.on('error', reject);
  });
}
// exam attempts that are still running must never feed review/stats (would leak answers)
const VISIBLE_ATTEMPT = `aa.attempt_id IN (SELECT id FROM attempts WHERE NOT (mode = 'exam' AND finished_at IS NULL))`;
const parseSections = (s) => String(s || 'vocab,grammar,reading').split(',').filter((x) => SECTION_LABEL[x]);

// vocab enrichment priority: learner's N2 list → Mazii → explanation author (AI)
const qUserVocab = db.prepare('SELECT reading, hanviet, meaning, note FROM user_vocab WHERE word = ?');
const qMazii = db.prepare('SELECT reading, hanviet, meaning FROM mazii_cache WHERE word = ? AND found = 1');
function enrichVocab(list) {
  return (Array.isArray(list) ? list : []).filter((v) => v && typeof v === 'object' && v.w).map((v) => {
    const w = String(v.w || '').trim();
    const u = qUserVocab.get(w);
    if (u) return { w, r: u.reading || v.r, hv: u.hanviet || v.hv, vi: u.meaning || v.vi, note: u.note || '', src: 'list' };
    const m = qMazii.get(w);
    if (m) return { w, r: m.reading || v.r, hv: (m.hanviet || v.hv || ''), vi: m.meaning || v.vi, alt: v.vi, src: 'mazii' };
    return { w, r: v.r, hv: v.hv, vi: v.vi, src: 'ai' };
  });
}
function fullQuestion(row) {
  let ex;
  try { ex = JSON.parse(row.explanation_json || '{}'); } catch { ex = {}; }
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) ex = { why: typeof ex === 'string' ? ex : '' };
  ex.vocab = enrichVocab(ex.vocab);
  return { id: row.id, num: row.num, answer: row.answer, explanation: ex };
}

// ───────────── queries ─────────────
const qExamList = db.prepare(`
  SELECT e.*,
    (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id AND q.section='vocab') AS n_vocab,
    (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id AND q.section='grammar') AS n_grammar,
    (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id AND q.section='reading') AS n_reading
  FROM exams e ORDER BY e.year DESC, e.month DESC`);
const qBest = db.prepare(`SELECT exam_id, MAX(CAST(score AS REAL)/total) AS best, COUNT(*) AS n,
  MAX(finished_at) AS last FROM attempts WHERE finished_at IS NOT NULL AND total > 0 GROUP BY exam_id`);
const qInProgress = db.prepare(`SELECT id, exam_id, mode, sections, started_at FROM attempts
  WHERE finished_at IS NULL AND mode != 'study' ORDER BY id DESC`);

function listExams() {
  const best = Object.fromEntries(qBest.all().map((r) => [r.exam_id, r]));
  const open = {};
  for (const a of qInProgress.all()) if (!open[a.exam_id]) open[a.exam_id] = a;
  return qExamList.all().map((e) => ({ ...e, stats: best[e.id] || null, open: open[e.id] || null }));
}

function examContent(examId, sections) {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
  if (!exam) return null;
  const ph = sections.map(() => '?').join(',');
  const mondai = db.prepare(`SELECT * FROM mondai WHERE exam_id = ? AND section IN (${ph}) ORDER BY no`).all(examId, ...sections);
  const passages = db.prepare(`SELECT p.* FROM passages p JOIN mondai m ON m.id = p.mondai_id
    WHERE m.exam_id = ? ORDER BY p.ord`).all(examId);
  const qs = db.prepare(`SELECT id, mondai_id, num, section, passage_ref, stem, options_json FROM questions
    WHERE exam_id = ? AND section IN (${ph}) ORDER BY num`).all(examId, ...sections);
  return {
    exam,
    mondai: mondai.map((m) => ({
      id: m.id, no: m.no, section: m.section, instruction: m.instruction, instruction_vi: m.instruction_vi,
      passages: passages.filter((p) => p.mondai_id === m.id).map((p) => ({ id: p.pid, label: p.label, text: p.text })),
      questions: qs.filter((q) => q.mondai_id === m.id).map((q) => ({
        id: q.id, num: q.num, section: q.section, passage: q.passage_ref, stem: q.stem, options: JSON.parse(q.options_json),
      })),
    })),
  };
}

function attemptState(id) {
  const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
  if (!a) return null;
  const sections = parseSections(a.sections);
  const content = examContent(a.exam_id, sections);
  if (!content) return { attempt: a, missing: true };
  const answers = db.prepare('SELECT question_id, choice, is_correct FROM attempt_answers WHERE attempt_id = ?').all(id);
  const flags = db.prepare('SELECT question_id FROM flags').all().map((f) => f.question_id);
  const out = { attempt: a, ...content, answers: {}, flags };
  // reveal explanations for answered questions in practice mode, or everything once finished
  // study mode ("xem đáp án") reveals everything up front, like a finished attempt
  const reveal = a.finished_at || a.mode === 'study' ? null : a.mode === 'practice' ? new Set(answers.map((x) => x.question_id)) : new Set();
  const qRow = db.prepare('SELECT * FROM questions WHERE id = ?');
  out.reveal = {};
  // exam mode before submit: never leak correctness to the client
  const hideCorrect = a.mode === 'exam' && !a.finished_at;
  for (const x of answers) out.answers[x.question_id] = { choice: x.choice, correct: hideCorrect ? null : x.is_correct };
  const allQ = content.mondai.flatMap((m) => m.questions);
  for (const q of allQ) {
    if (reveal === null || reveal.has(q.id)) out.reveal[q.id] = fullQuestion(qRow.get(q.id));
  }
  if (a.finished_at) out.summary = summarize(a, allQ, out.answers);
  return out;
}

function summarize(a, allQ, answers) {
  const by = {};
  for (const q of allQ) {
    const s = (by[q.section] = by[q.section] || { section: q.section, label: SECTION_LABEL[q.section], correct: 0, total: 0 });
    s.total++;
    if (answers[q.id] && answers[q.id].correct) s.correct++;
  }
  const sections = Object.values(by);
  const correct = sections.reduce((t, s) => t + s.correct, 0);
  const total = sections.reduce((t, s) => t + s.total, 0);
  return { correct, total, sections, elapsed_sec: a.elapsed_sec };
}

// ───────────── API ─────────────
const routes = [
  ['GET', /^\/api\/exams$/, () => listExams()],

  ['POST', /^\/api\/attempts$/, async (req) => {
    const b = await readBody(req);
    if (typeof b.examId !== 'string') return [400, { error: 'examId required' }];
    const exam = db.prepare('SELECT id FROM exams WHERE id = ?').get(b.examId);
    if (!exam) return [404, { error: 'exam not found' }];
    // keep only selected sections that actually have questions in this exam
    const counts = Object.fromEntries(db.prepare('SELECT section, COUNT(*) n FROM questions WHERE exam_id = ? GROUP BY section')
      .all(exam.id).map((r) => [r.section, r.n]));
    const sections = parseSections((Array.isArray(b.sections) ? b.sections : []).join(',')).filter((s) => counts[s] > 0);
    if (!sections.length) return [400, { error: 'Phần đã chọn chưa có câu hỏi nào' }];
    const mode = ['exam', 'study'].includes(b.mode) ? b.mode : 'practice';
    const limit = mode === 'exam' ? sections.reduce((t, s) => t + SECTION_MIN[s], 0) * 60 : null;
    const r = db.prepare(`INSERT INTO attempts (exam_id, mode, sections, started_at, time_limit_sec, elapsed_sec)
      VALUES (?,?,?,?,?,0)`).run(exam.id, mode, sections.join(','), now(), limit);
    return { id: Number(r.lastInsertRowid) };
  }],

  ['GET', /^\/api\/attempts\/(\d+)$/, (req, m) => attemptState(Number(m[1])) || [404, { error: 'not found' }]],

  // practice mode: answer one question → immediate grading + explanation
  ['POST', /^\/api\/attempts\/(\d+)\/answer$/, async (req, m) => {
    const id = Number(m[1]);
    const b = await readBody(req);
    const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
    if (!a) return [404, { error: 'attempt not found' }];
    if (a.finished_at) return [409, { error: 'attempt finished' }];
    if (typeof b.questionId !== 'string') return [400, { error: 'questionId required' }];
    const q = db.prepare('SELECT * FROM questions WHERE id = ? AND exam_id = ?').get(b.questionId, a.exam_id);
    if (!q) return [404, { error: 'question not found' }];
    const choice = b.choice == null ? null : Number(b.choice);
    if (choice !== null && ![1, 2, 3, 4].includes(choice)) return [400, { error: 'choice must be 1-4' }];
    if (a.mode === 'practice' && choice === null) return [400, { error: 'choice required' }];
    if (a.mode === 'practice') {
      const prev = db.prepare('SELECT choice FROM attempt_answers WHERE attempt_id=? AND question_id=?').get(id, q.id);
      if (prev) { // already answered OR answer already revealed → locked
        return { locked: true, choice: prev.choice, correct: prev.choice === q.answer ? 1 : 0, ...fullQuestion(q) };
      }
    }
    const correct = choice === q.answer ? 1 : 0;
    db.prepare(`INSERT INTO attempt_answers (attempt_id, question_id, choice, is_correct, answered_at)
      VALUES (?,?,?,?,?) ON CONFLICT(attempt_id, question_id) DO UPDATE SET choice=excluded.choice,
      is_correct=excluded.is_correct, answered_at=excluded.answered_at`).run(id, q.id, choice, correct, now());
    if (b.elapsed != null) db.prepare('UPDATE attempts SET elapsed_sec = ? WHERE id = ?').run(Number(b.elapsed) | 0, id);
    if (a.mode === 'practice') return { choice, correct, ...fullQuestion(q) };
    return { saved: true, choice };
  }],

  ['POST', /^\/api\/attempts\/(\d+)\/finish$/, async (req, m) => {
    const id = Number(m[1]);
    const b = await readBody(req);
    const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
    if (!a) return [404, { error: 'attempt not found' }];
    if (!a.finished_at) {
      const sections = parseSections(a.sections);
      const ph = sections.map(() => '?').join(',');
      const qs = db.prepare(`SELECT id, answer FROM questions WHERE exam_id = ? AND section IN (${ph})`).all(a.exam_id, ...sections);
      tx(db, () => {
        const ins = db.prepare(`INSERT INTO attempt_answers (attempt_id, question_id, choice, is_correct, answered_at)
          VALUES (?,?,?,?,?) ON CONFLICT(attempt_id, question_id) DO UPDATE SET choice=excluded.choice, is_correct=excluded.is_correct`);
        // exam mode: client may send its final answer map
        if (b.answers && a.mode === 'exam') {
          for (const q of qs) {
            const c = b.answers[q.id];
            if (c != null) ins.run(id, q.id, Number(c), Number(c) === q.answer ? 1 : 0, now());
          }
        }
        const score = db.prepare('SELECT COUNT(*) n FROM attempt_answers WHERE attempt_id = ? AND is_correct = 1').get(id).n;
        db.prepare('UPDATE attempts SET finished_at = ?, score = ?, total = ?, elapsed_sec = COALESCE(?, elapsed_sec) WHERE id = ?')
          .run(now(), score, qs.length, b.elapsed != null ? Number(b.elapsed) | 0 : null, id);
      });
    }
    return attemptState(id);
  }],

  // periodic / on-leave timer save (sendBeacon friendly)
  ['POST', /^\/api\/attempts\/(\d+)\/tick$/, async (req, m) => {
    const b = await readBody(req);
    const e = Number(b.elapsed);
    if (Number.isFinite(e) && e >= 0) {
      db.prepare('UPDATE attempts SET elapsed_sec = MAX(COALESCE(elapsed_sec, 0), ?) WHERE id = ? AND finished_at IS NULL').run(e | 0, Number(m[1]));
    }
    return { ok: true };
  }],

  // practice mode: show the answer without choosing (recorded as not correct, question locked)
  ['POST', /^\/api\/attempts\/(\d+)\/reveal$/, async (req, m) => {
    const id = Number(m[1]);
    const b = await readBody(req);
    const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
    if (!a) return [404, { error: 'attempt not found' }];
    if (a.mode === 'exam' && !a.finished_at) return [403, { error: 'Không xem đáp án khi đang thi thử' }];
    if (typeof b.questionId !== 'string') return [400, { error: 'questionId required' }];
    const q = db.prepare('SELECT * FROM questions WHERE id = ? AND exam_id = ?').get(b.questionId, a.exam_id);
    if (!q) return [404, { error: 'question not found' }];
    let choice = null;
    if (a.mode === 'practice' && !a.finished_at) {
      const prev = db.prepare('SELECT choice FROM attempt_answers WHERE attempt_id=? AND question_id=?').get(id, q.id);
      if (prev) choice = prev.choice;
      else db.prepare(`INSERT INTO attempt_answers (attempt_id, question_id, choice, is_correct, answered_at)
        VALUES (?,?,NULL,0,?)`).run(id, q.id, now());
    }
    return { choice, revealed: true, ...fullQuestion(q) };
  }],

  ['DELETE', /^\/api\/attempts\/(\d+)$/, (req, m) => {
    db.prepare('DELETE FROM attempts WHERE id = ?').run(Number(m[1]));
    return { ok: true };
  }],

  ['GET', /^\/api\/history$/, () => db.prepare(`SELECT a.*, COALESCE(e.title, 'Đề ' || a.exam_id) AS title
    FROM attempts a LEFT JOIN exams e ON e.id = a.exam_id ORDER BY a.id DESC LIMIT 200`).all()],

  ['GET', /^\/api\/stats$/, () => {
    const bySection = db.prepare(`SELECT q.section, COUNT(*) total, SUM(aa.is_correct) correct
      FROM attempt_answers aa JOIN questions q ON q.id = aa.question_id WHERE aa.choice IS NOT NULL AND ${VISIBLE_ATTEMPT}
      GROUP BY q.section`).all();
    const byMondai = db.prepare(`SELECT m.no, m.section, COUNT(*) total, SUM(aa.is_correct) correct
      FROM attempt_answers aa JOIN questions q ON q.id = aa.question_id JOIN mondai m ON m.id = q.mondai_id
      WHERE aa.choice IS NOT NULL AND ${VISIBLE_ATTEMPT} GROUP BY m.no ORDER BY m.no`).all();
    const totals = db.prepare(`SELECT COUNT(*) attempts, SUM(finished_at IS NOT NULL) finished FROM attempts`).get();
    const content = db.prepare(`SELECT COUNT(DISTINCT exam_id) exams, COUNT(*) questions FROM questions`).get();
    return { bySection, byMondai, totals, content };
  }],

  // wrong answers (latest answer per question is wrong) for review
  ['GET', /^\/api\/review\/wrong$/, () => {
    const rows = db.prepare(`
      SELECT q.*, m.instruction, m.no AS mondai_no, aa.choice, aa.answered_at
      FROM attempt_answers aa
      JOIN (SELECT question_id, MAX(answered_at) t FROM attempt_answers aa WHERE choice IS NOT NULL AND ${VISIBLE_ATTEMPT}
            GROUP BY question_id) last
        ON last.question_id = aa.question_id AND last.t = aa.answered_at
      JOIN questions q ON q.id = aa.question_id JOIN mondai m ON m.id = q.mondai_id
      WHERE aa.is_correct = 0 AND aa.choice IS NOT NULL AND ${VISIBLE_ATTEMPT}
      GROUP BY q.id ORDER BY aa.answered_at DESC LIMIT 300`).all();
    return rows.map((r) => ({
      id: r.id, exam_id: r.exam_id, num: r.num, section: r.section, mondai_no: r.mondai_no, instruction: r.instruction,
      stem: r.stem, options: JSON.parse(r.options_json), choice: r.choice, passage: r.passage_ref,
      passages: r.passage_ref ? db.prepare('SELECT pid id, label, text FROM passages WHERE mondai_id = ? ORDER BY ord').all(r.mondai_id) : [],
      ...fullQuestion(r),
    }));
  }],

  ['GET', /^\/api\/flags$/, () => {
    const rows = db.prepare(`SELECT q.*, m.instruction, m.no AS mondai_no FROM flags f JOIN questions q ON q.id = f.question_id
      JOIN mondai m ON m.id = q.mondai_id ORDER BY f.created_at DESC`).all();
    return rows.map((r) => ({
      id: r.id, exam_id: r.exam_id, num: r.num, section: r.section, mondai_no: r.mondai_no, instruction: r.instruction,
      stem: r.stem, options: JSON.parse(r.options_json), passage: r.passage_ref,
      passages: r.passage_ref ? db.prepare('SELECT pid id, label, text FROM passages WHERE mondai_id = ? ORDER BY ord').all(r.mondai_id) : [],
      ...fullQuestion(r),
    }));
  }],
  ['POST', /^\/api\/flags$/, async (req) => {
    const b = await readBody(req);
    if (typeof b.questionId !== 'string') return [400, { error: 'questionId required' }];
    if (b.on) db.prepare('INSERT OR IGNORE INTO flags (question_id, created_at) VALUES (?,?)').run(b.questionId, now());
    else db.prepare('DELETE FROM flags WHERE question_id = ?').run(b.questionId);
    return { ok: true };
  }],

  // vocabulary from all explanations, enriched
  ['GET', /^\/api\/vocab$/, (req) => {
    const u = new URL(req.url, 'http://x');
    const q = (u.searchParams.get('q') || '').trim();
    const rows = db.prepare(`SELECT v.word, MAX(v.reading) reading, MAX(v.hanviet) hanviet, MAX(v.meaning) meaning,
        COUNT(*) freq, GROUP_CONCAT(DISTINCT q.exam_id) exams
      FROM vocab v JOIN questions q ON q.id = v.question_id
      WHERE (? = '' OR v.word LIKE ? OR v.reading LIKE ? OR v.meaning LIKE ? OR v.hanviet LIKE ?)
      GROUP BY v.word ORDER BY freq DESC, v.word LIMIT 500`).all(q, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    return rows.map((r) => {
      const [e] = enrichVocab([{ w: r.word, r: r.reading, hv: r.hanviet, vi: r.meaning }]);
      return { ...e, freq: r.freq, exams: (r.exams || '').split(',').sort() };
    });
  }],
];

// ───────────── static files ─────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
function serveStatic(req, res, pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return send(res, 400, 'bad request', 'text/plain'); }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  try {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { return send(res, 400, { error: 'bad url' }); }
    if (pathname.startsWith('/api/')) {
      for (const [method, re, fn] of routes) {
        const m = pathname.match(re);
        if (m && req.method === method) {
          const out = await fn(req, m);
          if (Array.isArray(out) && typeof out[0] === 'number' && out.length === 2) return send(res, out[0], out[1]);
          return send(res, 200, out);
        }
      }
      return send(res, 404, { error: 'no route' });
    }
    serveStatic(req, res, pathname);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) send(res, e instanceof HttpError ? e.code : 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const n = db.prepare('SELECT COUNT(*) n FROM questions').get().n;
  console.log(`JLPT N2 practice → http://localhost:${PORT}   (${n} questions in DB)`);
  if (!n) console.log('DB is empty — run: node scripts/build-db.js');
});
