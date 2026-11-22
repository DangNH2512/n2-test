#!/usr/bin/env node
'use strict';
// Look up every vocab word used in explanations on Mazii (javi dictionary) and cache the
// result in mazii_cache. The server shows Mazii's Hán Việt + meaning in explanations
// (after the learner's own list). Only public dictionary words are sent.
// Usage: node scripts/enrich-mazii.js [--refresh]
const { openDb } = require('./lib/db');

const db = openDb();
const refresh = process.argv.includes('--refresh');
const words = db.prepare(`SELECT DISTINCT word FROM vocab
  WHERE ${refresh ? '1=1' : 'word NOT IN (SELECT word FROM mazii_cache)'}`).all().map((r) => r.word);
console.log(`Words to look up: ${words.length}`);

const ins = db.prepare(`INSERT OR REPLACE INTO mazii_cache (word,found,reading,hanviet,meaning,fetched_at)
  VALUES (?,?,?,?,?,?)`);

async function lookup(word) {
  const res = await fetch('https://mazii.net/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'n2-practice-local/1.0' },
    body: JSON.stringify({ dict: 'javi', type: 'word', query: word, limit: 5, page: 1 }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const list = (j && j.data) || [];
  // exact match on the written form first, else on kana
  const hit = list.find((d) => d.word === word) ||
    list.find((d) => (d.phonetic || '').split(/\s+/).includes(word));
  if (!hit) return { found: 0 };
  const means = (hit.means || []).map((m) => m.mean).filter(Boolean);
  return {
    found: 1,
    reading: hit.phonetic || '',
    hanviet: (hit.han || '').trim(),
    meaning: (hit.short_mean || means.slice(0, 3).join('; ') || '').trim(),
  };
}

(async () => {
  let done = 0, found = 0, failed = 0;
  const queue = words.slice();
  async function worker() {
    while (queue.length) {
      const w = queue.shift();
      try {
        const r = await lookup(w);
        ins.run(w, r.found, r.reading || null, r.hanviet || null, r.meaning || null, new Date().toISOString());
        if (r.found) found++;
      } catch (e) {
        failed++;
      }
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${words.length} (found ${found}, failed ${failed})`);
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`Done: ${done} looked up, ${found} found on Mazii, ${failed} failed (retry later).`);
})();
