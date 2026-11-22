#!/usr/bin/env node
'use strict';
// Load data/parts/<examId>/m*.json + data/answer_key.json (+ optional data/vocab_list.json)
// into the SQLite DB. Content tables are rebuilt; learner progress is kept.
// Usage: node scripts/build-db.js
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, DB_PATH, openDb, tx } = require('./lib/db');

const key = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'answer_key.json'), 'utf8'));
const partsDir = path.join(ROOT, 'data', 'parts');
const db = openDb();

const SECTION_OF = (no) => (no <= 6 ? 'vocab' : no <= 9 ? 'grammar' : 'reading');
const pad = (n) => String(n).padStart(2, '0');

let report = [];
tx(db, () => {
  for (const t of ['vocab', 'questions', 'passages', 'mondai', 'exams']) db.exec(`DELETE FROM ${t}`);

  const insExam = db.prepare('INSERT INTO exams (id,title,year,month,question_count) VALUES (?,?,?,?,?)');
  const insMondai = db.prepare('INSERT INTO mondai (id,exam_id,no,section,instruction,instruction_vi) VALUES (?,?,?,?,?,?)');
  const insPassage = db.prepare('INSERT INTO passages (id,mondai_id,pid,label,text,ord) VALUES (?,?,?,?,?,?)');
  const insQ = db.prepare(`INSERT INTO questions
    (id,exam_id,mondai_id,num,section,passage_ref,stem,options_json,answer,explanation_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insVocab = db.prepare('INSERT OR IGNORE INTO vocab (word,reading,hanviet,meaning,question_id) VALUES (?,?,?,?,?)');

  const exams = fs.existsSync(partsDir) ? fs.readdirSync(partsDir).filter((d) => key[d]).sort() : [];
  for (const examId of exams) {
    const files = fs.readdirSync(path.join(partsDir, examId)).filter((f) => /^m\d+\.json$/.test(f)).sort();
    if (!files.length) continue;
    const [y, m] = examId.split('-').map(Number);
    const official = key[examId].answers;
    let qCount = 0, fixed = 0, bad = 0;
    const rows = [];
    for (const f of files) {
      let part;
      try {
        part = JSON.parse(fs.readFileSync(path.join(partsDir, examId, f), 'utf8'));
      } catch (e) {
        report.push(`${examId}/${f}: INVALID JSON — skipped (${e.message})`);
        bad++;
        continue;
      }
      rows.push(part);
    }
    insExam.run(examId, `JLPT N2 ${m}/${y}`, y, m, 0);
    for (const part of rows.sort((a, b) => a.mondai - b.mondai)) {
      const mid = `${examId}:${pad(part.mondai)}`;
      const section = SECTION_OF(part.mondai);
      insMondai.run(mid, examId, part.mondai, section, part.instruction || '', part.instruction_vi || '');
      (part.passages || []).forEach((p, i) => insPassage.run(`${mid}:${p.id}`, mid, p.id, p.label || '', p.text || '', i));
      for (const q of part.questions || []) {
        const ans = official[String(q.num)];
        if (!ans) { report.push(`${examId} q${q.num}: not in official key — skipped`); continue; }
        if (q.answer !== ans) fixed++;
        const qid = `${examId}:q${pad(q.num)}`;
        insQ.run(qid, examId, mid, q.num, section, q.passage || null, q.stem || '',
          JSON.stringify(q.options || []), ans, JSON.stringify(q.explanation || {}));
        for (const v of (q.explanation && q.explanation.vocab) || []) {
          if (v && v.w) insVocab.run(String(v.w).trim(), v.r || '', v.hv || '', v.vi || '', qid);
        }
        qCount++;
      }
    }
    db.prepare('UPDATE exams SET question_count=? WHERE id=?').run(qCount, examId);
    const missing = key[examId].count - qCount;
    report.push(`${examId}: ${qCount}/${key[examId].count} questions` +
      (missing ? `  ⚠ missing ${missing}` : '') + (fixed ? `  (answer overridden by official key: ${fixed})` : '') +
      (bad ? `  ⚠ ${bad} bad files` : ''));
  }

  // learner's own vocab list (priority source for explanations)
  const listPath = path.join(ROOT, 'data', 'vocab_list.json');
  if (fs.existsSync(listPath)) {
    const list = JSON.parse(fs.readFileSync(listPath, 'utf8'));
    db.exec('DELETE FROM user_vocab');
    const ins = db.prepare('INSERT OR REPLACE INTO user_vocab (word,reading,hanviet,meaning,note) VALUES (?,?,?,?,?)');
    for (const v of list) if (v.w) ins.run(v.w, v.r || '', v.hv || '', v.vi || '', v.note || '');
    report.push(`user vocab list: ${list.length} entries`);
  }

  // keep learner history consistent with the (possibly corrected) official answers
  db.exec(`UPDATE attempt_answers SET is_correct =
    CASE WHEN choice IS NULL THEN 0
         ELSE COALESCE((SELECT q.answer = attempt_answers.choice FROM questions q WHERE q.id = attempt_answers.question_id), is_correct) END`);
  db.exec(`UPDATE attempts SET score = (SELECT COUNT(*) FROM attempt_answers aa WHERE aa.attempt_id = attempts.id AND aa.is_correct = 1)
    WHERE finished_at IS NOT NULL`);
});

console.log(report.join('\n'));
const t = db.prepare('SELECT COUNT(*) n FROM questions').get();
console.log(`\nDB: ${DB_PATH}\nTotal questions: ${t.n}`);
