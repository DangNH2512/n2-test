#!/usr/bin/env node
'use strict';
// Import the learner's own N2 vocab list (priority #1 source in explanations) into
// data/vocab_list.json, then rebuild with `npm run build:db`.
//
// Accepted input (.txt / .csv / .tsv / .json), one word per line, e.g.:
//   詳細	しょうさい	TƯỜNG TẾ	chi tiết            (tab-separated: word, reading, hán việt, meaning)
//   詳細,しょうさい,TƯỜNG TẾ,chi tiết                (comma-separated, same order)
//   詳細（しょうさい）: chi tiết                       (loose text)
//   詳細 (しょうさい) [TƯỜNG TẾ] - chi tiết
//   [{"w":"詳細","r":"しょうさい","hv":"TƯỜNG TẾ","vi":"chi tiết"}]   (JSON)
// Usage: node scripts/import-vocab.js <file> [--append]
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'vocab_list.json');
const src = process.argv[2];
if (!src) { console.error('Usage: node scripts/import-vocab.js <file> [--append]'); process.exit(1); }
const append = process.argv.includes('--append');

const raw = fs.readFileSync(src, 'utf8').replace(/^﻿/, '');
const isKana = (s) => /^[぀-ヿー・\s]+$/.test(s);
const isUpperViet = (s) => s === s.toUpperCase() && /[A-ZÀ-Ỹ]/.test(s) && !/[぀-鿿]/.test(s);

function parseLine(line) {
  line = line.trim();
  if (!line || line.startsWith('#')) return null;
  let cols = null;
  if (line.includes('\t')) cols = line.split('\t');
  else if ((line.match(/,/g) || []).length >= 2 && /^[^,]*[぀-鿿]/.test(line)) cols = line.split(',');
  if (cols) {
    cols = cols.map((c) => c.trim());
    const [w, ...rest] = cols;
    const e = { w, r: '', hv: '', vi: '' };
    for (const c of rest) {
      if (!c) continue;
      if (!e.r && isKana(c)) e.r = c;
      else if (!e.hv && isUpperViet(c)) e.hv = c;
      else e.vi = e.vi ? `${e.vi}; ${c}` : c;
    }
    return e.w ? e : null;
  }
  // loose: word (reading) [HV] sep meaning
  const m = line.match(/^([^\s(（:：\-–=]+)\s*(?:[(（]([^)）]+)[)）])?\s*(?:\[([^\]]+)\])?\s*[:：\-–=]?\s*(.*)$/);
  if (!m) return null;
  let [, w, r = '', hv = '', vi = ''] = m;
  if (!hv) {
    const h = vi.match(/^([A-ZÀ-Ỹ][A-ZÀ-Ỹ\s]+?)\s*[:：\-–]\s*(.*)$/);
    if (h && isUpperViet(h[1])) { hv = h[1].trim(); vi = h[2]; }
  }
  return { w: w.trim(), r: r.trim(), hv: hv.trim(), vi: vi.trim() };
}

let items;
if (/\.json$/i.test(src)) items = JSON.parse(raw);
else items = raw.split(/\r?\n/).map(parseLine).filter(Boolean);

const map = new Map();
if (append && fs.existsSync(OUT)) for (const v of JSON.parse(fs.readFileSync(OUT, 'utf8'))) map.set(v.w, v);
for (const v of items) if (v && v.w) map.set(v.w, { ...map.get(v.w), ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)) });
fs.writeFileSync(OUT, JSON.stringify([...map.values()], null, 1));
console.log(`Imported ${items.length} lines → ${map.size} words in ${path.relative(ROOT, OUT)}`);
console.log('Next: npm run build:db   (then restart the server)');
