// JLPT N2 Luyện Đề — frontend (vanilla JS, no build step)
const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');
const SECTION = { vocab: '文字・語彙', grammar: '文法', reading: '読解' };
const SECTION_VI = { vocab: 'Từ vựng – Chữ Hán', grammar: 'Ngữ pháp', reading: 'Đọc hiểu' };
const SRC_LABEL = { list: 'List N2', mazii: 'Mazii', ai: 'Giải thích' };

// ───────────── utils ─────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// escape, keep <u>, and render ★ ordering blanks (問題8) as slots: ＿＿＿ → blank slot, ＿★＿ / ★ → star slot
const rich = (s) => esc(s).replace(/&lt;(\/?)u&gt;/g, '<$1u>');
const richStem = (s) => rich(s)
  .replace(/<u>\s*★\s*<\/u>/g, '★')
  .replace(/[＿_]*★[＿_]*/g, '<span class="slot star">★</span>')
  .replace(/[＿_]{3,}/g, '<span class="slot"></span>');
const plain = (s) => String(s ?? '').replace(/<\/?u>/g, '');
const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// theme + font size
function applyPrefs() {
  const theme = store.get('theme', null);
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.setProperty('--fs', `${store.get('fs', 17)}px`);
}
document.getElementById('theme-toggle').onclick = () => {
  const cur = document.documentElement.getAttribute('data-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  store.set('theme', cur === 'dark' ? 'light' : 'dark');
  applyPrefs();
};
document.getElementById('font-inc').onclick = () => { store.set('fs', Math.min(24, store.get('fs', 17) + 1)); applyPrefs(); };
document.getElementById('font-dec').onclick = () => { store.set('fs', Math.max(13, store.get('fs', 17) - 1)); applyPrefs(); };
applyPrefs();

function modal(html, onMount) {
  $modal.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
  const bg = $modal.firstElementChild;
  bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
  onMount && onMount($modal.querySelector('.modal'));
}
const closeModal = () => { $modal.innerHTML = ''; };

// ───────────── keyboard ─────────────
let keyHandler = null;
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && $modal.innerHTML) return closeModal();
  if ($modal.innerHTML) return;
  // let Enter/Space activate a focused link/button normally
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('a, button, summary')) return;
  keyHandler && keyHandler(e);
});

// ───────────── router ─────────────
let timerHandle = null;
let routeSeq = 0; // bumps on every navigation; async renders bail out if stale
function stopTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
  if (S && !S.finished) saveElapsed(true);
}
function route() {
  routeSeq++;
  stopTimer();
  keyHandler = null;
  closeModal();
  const h = location.hash.replace(/^#/, '') || '/';
  const parts = h.split('/').filter(Boolean);
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active',
    (parts[0] || 'home') === a.dataset.nav || (!parts[0] && a.dataset.nav === 'home')));
  window.scrollTo(0, 0);
  if (!parts.length) return renderHome();
  if (parts[0] === 'attempt') return renderAttempt(Number(parts[1]), parts[2] === 'q' ? Number(parts[3]) : null, parts[2] === 'result');
  if (parts[0] === 'wrong') return renderReviewList('wrong');
  if (parts[0] === 'flags') return renderReviewList('flags');
  if (parts[0] === 'vocab') return renderVocab();
  if (parts[0] === 'stats') return renderStats();
  renderHome();
}
window.addEventListener('hashchange', route);

// ───────────── home ─────────────
async function renderHome() {
  $app.innerHTML = '<div class="loading">Đang tải danh sách đề…</div>';
  const exams = await api('/api/exams');
  if (!exams.length) {
    $app.innerHTML = `<div class="empty"><h2>Chưa có đề nào trong database</h2><p>Chạy <code>node scripts/build-db.js</code> rồi tải lại trang.</p></div>`;
    return;
  }
  const filter = store.get('homeFilter', 'all');
  const totalQ = exams.reduce((t, e) => t + e.question_count, 0);
  const done = exams.filter((e) => e.stats).length;
  const shown = exams.filter((e) => filter === 'all' || (filter === 'todo' ? !e.stats : filter === 'done' ? !!e.stats : String(e.year).startsWith(filter)));
  $app.innerHTML = `
    <div class="hero">
      <div>
        <h1>Đề thi JLPT N2</h1>
        <p class="sub">${exams.length} đề · ${totalQ} câu (文字・語彙 · 文法 · 読解 — không gồm nghe) · đã làm ${done}/${exams.length} đề</p>
      </div>
      <div class="filters">
        ${[['all', 'Tất cả'], ['todo', 'Chưa làm'], ['done', 'Đã làm'], ['202', '2020+'], ['201', '2010–2019']]
          .map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="grid">
      ${shown.map((e) => {
        const best = e.stats ? Math.round(e.stats.best * 100) : null;
        const cls = best == null ? '' : best >= 70 ? 'ok' : best >= 50 ? 'warn' : 'bad';
        return `<div class="card exam-card">
          <div class="title"><span>${esc(e.title.replace('JLPT ', ''))}</span>
            ${best != null ? `<span class="badge ${cls}">Cao nhất ${best}%</span>` : '<span class="badge">Chưa làm</span>'}</div>
          <div class="meta"><span>語彙 ${e.n_vocab}</span><span>文法 ${e.n_grammar}</span><span>読解 ${e.n_reading}</span>
            ${e.stats ? `<span>· ${e.stats.n} lần</span>` : ''}</div>
          ${best != null ? `<div class="progress"><div style="width:${best}%"></div></div>` : ''}
          <div class="actions">
            ${e.open ? `<a class="btn primary small" href="#/attempt/${e.open.id}">▶ Làm tiếp (${e.open.mode === 'exam' ? 'thi thử' : 'luyện tập'})</a>` : ''}
            <button class="btn small ${e.open ? '' : 'primary'}" data-start="${e.id}" data-mode="practice">Luyện tập</button>
            <button class="btn small" data-start="${e.id}" data-mode="exam">⏱ Thi thử</button>
            <button class="btn small" data-start="${e.id}" data-mode="study" title="Hiện sẵn đáp án + giải thích, không chấm điểm">📖 Xem đáp án</button>
          </div>
        </div>`;
      }).join('') || '<div class="empty">Không có đề nào khớp bộ lọc.</div>'}
    </div>`;
  $app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { store.set('homeFilter', b.dataset.f); renderHome(); });
  $app.querySelectorAll('[data-start]').forEach((b) => b.onclick = () => {
    const exam = exams.find((x) => x.id === b.dataset.start);
    openStart(exam, b.dataset.mode);
  });
}

function openStart(exam, mode) {
  const secs = store.get('lastSections', ['vocab', 'grammar', 'reading']);
  modal(`
    <h3>${esc(exam.title)}</h3>
    <p class="sub" style="margin-bottom:8px">Chọn chế độ và phần thi</p>
    <div class="mode-pick">
      <label><input type="radio" name="mode" value="practice" ${!['exam', 'study'].includes(mode) ? 'checked' : ''}><b>Luyện tập</b><small>Chấm & giải thích ngay từng câu (có nút hiện đáp án)</small></label>
      <label><input type="radio" name="mode" value="exam" ${mode === 'exam' ? 'checked' : ''}><b>⏱ Thi thử</b><small>Bấm giờ, nộp bài mới chấm</small></label>
      <label><input type="radio" name="mode" value="study" ${mode === 'study' ? 'checked' : ''}><b>📖 Xem đáp án</b><small>Hiện sẵn đáp án & giải thích, không chấm</small></label>
    </div>
    ${['vocab', 'grammar', 'reading'].map((s) => {
      const n = exam['n_' + s];
      return `<label class="opt-row" style="${n ? '' : 'opacity:.5;cursor:not-allowed'}"><input type="checkbox" name="sec" value="${s}" ${n && secs.includes(s) ? 'checked' : ''} ${n ? '' : 'disabled'}>
        <span><b class="jp">${SECTION[s]}</b> · ${SECTION_VI[s]} <span class="badge">${n ? `${n} câu` : 'chưa có dữ liệu'}</span></span></label>`;
    }).join('')}
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="btn ghost" data-close>Huỷ</button>
      <button class="btn primary" data-go>Bắt đầu</button>
    </div>`, (m) => {
    m.querySelector('[data-close]').onclick = closeModal;
    m.querySelector('[data-go]').onclick = async () => {
      const sections = [...m.querySelectorAll('input[name=sec]:checked')].map((i) => i.value);
      if (!sections.length) return toast('Chọn ít nhất một phần');
      store.set('lastSections', sections);
      const md = m.querySelector('input[name=mode]:checked').value;
      try {
        const r = await api('/api/attempts', { method: 'POST', body: { examId: exam.id, mode: md, sections } });
        closeModal();
        location.hash = `#/attempt/${r.id}`;
      } catch (e) { toast(e.message); }
    };
  });
}

// ───────────── attempt ─────────────
let S = null; // current attempt state

function flatten(data) {
  const list = [];
  for (const m of data.mondai) for (const q of m.questions) list.push({ ...q, mondai: m });
  return list;
}

async function renderAttempt(id, qIdx, showResult) {
  const seq = routeSeq;
  S = null;
  $app.innerHTML = '<div class="loading">Đang tải đề…</div>';
  let data;
  try { data = await api(`/api/attempts/${id}`); } catch (e) {
    if (seq !== routeSeq) return;
    $app.innerHTML = `<div class="empty">Không tìm thấy lượt làm bài này. <a href="#/">Về trang chủ</a></div>`;
    return;
  }
  if (seq !== routeSeq) return; // user navigated away meanwhile
  if (data.missing || !data.mondai || !flatten(data).length) {
    $app.innerHTML = `<div class="empty"><h2>Lượt làm bài này không có câu hỏi</h2>
      <p>Đề hoặc phần thi đã chọn chưa có dữ liệu.</p>
      <button class="btn" id="del-empty">Xoá lượt này</button> <a class="btn ghost" href="#/">← Danh sách đề</a></div>`;
    document.getElementById('del-empty').onclick = async () => { await api(`/api/attempts/${id}`, { method: 'DELETE' }); location.hash = '#/'; };
    return;
  }
  const flat = flatten(data);
  const finished = !!data.attempt.finished_at;
  const local = finished ? {} : store.get(`att:${id}`, {});
  S = {
    id, data, flat, finished, mode: data.attempt.mode,
    answers: Object.fromEntries(Object.entries(data.answers).map(([k, v]) => [k, v.choice])),
    correct: Object.fromEntries(Object.entries(data.answers).map(([k, v]) => [k, v.correct])),
    local, // exam mode: answers kept locally until submit
    reveal: data.reveal || {},
    flags: new Set(data.flags),
    elapsed: data.attempt.elapsed_sec || 0,
    visited: new Set(store.get(`seen:${id}`, [])), // study mode: questions already viewed
  };
  if (S.mode === 'exam' && !finished) Object.assign(S.answers, local);
  if (finished && (showResult || qIdx == null)) return renderResult();
  if (qIdx == null) {
    const firstOpen = flat.findIndex((q) => S.answers[q.id] == null);
    qIdx = firstOpen < 0 ? 0 : firstOpen;
  }
  S.idx = Math.min(Math.max(0, qIdx), flat.length - 1);
  drawAttempt();
  if (!finished) {
    // wall-clock based (not throttled when the tab is hidden); saved every 15s and when leaving the page
    S.baseElapsed = S.elapsed;
    S.t0 = Date.now();
    S.lastSave = Date.now();
    const att = S;
    timerHandle = setInterval(() => {
      if (S !== att) return;
      S.elapsed = S.baseElapsed + Math.floor((Date.now() - S.t0) / 1000);
      const el = document.getElementById('timer');
      if (el) updateTimer(el);
      if (Date.now() - S.lastSave > 15000) saveElapsed(false);
      if (S.mode === 'exam' && S.data.attempt.time_limit_sec && S.elapsed >= S.data.attempt.time_limit_sec) {
        clearInterval(timerHandle);
        timerHandle = null;
        toast('Hết giờ! Đang nộp bài…');
        finishAttempt(true);
      }
    }, 1000);
  }
}

function saveElapsed(beacon) {
  if (!S || S.finished) return;
  S.lastSave = Date.now();
  const url = `/api/attempts/${S.id}/tick`;
  const body = JSON.stringify({ elapsed: S.elapsed });
  if (beacon && navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
  else fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
}
window.addEventListener('pagehide', () => saveElapsed(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveElapsed(true); });

function updateTimer(el) {
  const lim = S.data.attempt.time_limit_sec;
  if (S.mode === 'exam' && lim) {
    const left = lim - S.elapsed;
    el.textContent = fmtTime(left);
    el.classList.toggle('low', left < 300);
  } else el.textContent = fmtTime(S.elapsed);
}

function qState(q) {
  const rev = S.reveal[q.id];
  const ch = S.answers[q.id];
  if (rev && ch != null) return ch === rev.answer ? 'ok' : 'bad';
  if (S.mode === 'study' && !S.finished) return S.visited.has(q.id) ? 'seen' : '';
  if (rev && S.finished) return 'bad'; // skipped
  if (rev) return 'seen'; // practice: answer revealed without choosing
  if (ch != null) return 'answered';
  return '';
}

const MODE_LABEL = { practice: 'Luyện tập', exam: 'Thi thử', study: 'Xem đáp án' };

function drawAttempt() {
  const q = S.flat[S.idx];
  const m = q.mondai;
  const rev = S.reveal[q.id];
  const study = S.mode === 'study' && !S.finished;
  if (study && !S.visited.has(q.id)) { S.visited.add(q.id); store.set(`seen:${S.id}`, [...S.visited]); }
  const answeredN = S.flat.filter((x) => S.answers[x.id] != null).length;
  const seenN = S.flat.filter((x) => qState(x) === 'seen').length;
  const okN = S.flat.filter((x) => qState(x) === 'ok').length;
  const revN = S.flat.filter((x) => S.reveal[x.id] && S.answers[x.id] != null).length;
  const doneN = study ? seenN : answeredN + (S.mode === 'practice' ? seenN : 0);
  const canReveal = S.mode === 'practice' && !S.finished && !rev;

  // navigator grouped by mondai
  const groups = S.data.mondai.map((mm) => `
    <div class="nav-group jp">問題${mm.no} · ${SECTION[mm.section]}</div>
    <div class="nav-grid">${mm.questions.map((qq) => {
      const i = S.flat.findIndex((x) => x.id === qq.id);
      return `<button class="qbtn ${qState(qq)} ${i === S.idx ? 'current' : ''} ${S.flags.has(qq.id) ? 'flag' : ''}" data-go="${i}">${qq.num}</button>`;
    }).join('')}</div>`).join('');

  const passages = q.passage ? m.passages.filter((p) => q.passage === 'AB' ? ['A', 'B'].includes(p.id) : p.id === q.passage) : [];
  const evidence = rev && rev.explanation && rev.explanation.evidence;
  const passageHtml = passages.map((p) => `
    <div class="card passage">${p.label ? `<h4>${esc(p.label)}</h4>` : ''}${highlight(rich(p.text), evidence)}</div>`).join('');

  const chosen = S.answers[q.id];
  const optsHtml = q.options.map((o, i) => {
    const n = i + 1;
    let cls = '', tag = '';
    if (rev) {
      if (n === rev.answer) { cls = 'correct'; tag = n === chosen ? '✓ Bạn chọn · Đúng' : '✓ Đáp án đúng'; }
      else if (n === chosen) { cls = 'wrong'; tag = '✗ Bạn chọn'; }
    } else if (n === chosen) cls = 'selected';
    return `<button class="option ${cls}" data-opt="${n}" ${rev ? 'disabled' : ''}>
      <span class="key">${n}</span><span>${rich(o)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</button>`;
  }).join('');

  const isLast = S.idx === S.flat.length - 1;
  $app.innerHTML = `
    <div class="attempt">
      <aside class="side"><div class="card">
        <div class="side-head">
          <div><div style="font-weight:700">${esc(S.data.exam.title)}</div>
            <span class="badge ${S.mode === 'exam' ? 'accent' : study ? 'warn' : 'info'}">${S.finished ? 'Xem lại' : MODE_LABEL[S.mode]}</span></div>
          ${S.finished || study ? '' : `<div class="timer" id="timer" title="${S.mode === 'exam' ? 'Thời gian còn lại' : 'Thời gian đã làm'}"></div>`}
        </div>
        <div class="scoreline">${study ? `📖 Đáp án hiện sẵn · đã xem ${seenN}/${S.flat.length}`
          : `Đã làm ${answeredN}/${S.flat.length}${revN ? ` · Đúng ${okN}/${revN} (${pct(okN, revN)}%)` : ''}${seenN ? ` · Xem đáp án ${seenN}` : ''}`}</div>
        <div class="progress"><div style="width:${pct(doneN, S.flat.length)}%;background:var(--info)"></div></div>
        <details class="nav-details" ${window.innerWidth < 960 ? '' : 'open'}>
          <summary>Danh sách câu (câu ${q.num} · ${S.idx + 1}/${S.flat.length})</summary>
          ${groups}
          <div class="legend">
            <span style="--c:var(--info-soft)">Đã chọn</span><span style="--c:var(--ok-soft)">Đúng</span>
            <span style="--c:var(--bad-soft)">Sai</span><span style="--c:var(--warn-soft)">${study ? 'Đã xem' : 'Xem đáp án'}</span><span style="--c:var(--warn)">Đánh dấu</span>
          </div>
        </details>
        <div style="display:grid;gap:8px;margin-top:14px">
          ${S.finished ? `<a class="btn" href="#/attempt/${S.id}/result">📊 Xem kết quả</a>`
            : study ? `<button class="btn primary" data-to-practice>✍️ Làm thử phần này (luyện tập)</button>`
            : `<button class="btn primary" data-finish>${S.mode === 'exam' ? 'Nộp bài & chấm điểm' : 'Kết thúc luyện tập'}</button>`}
          <a class="btn ghost" href="#/">← Danh sách đề</a>
        </div>
      </div></aside>

      <section class="main-col">
        <div class="mondai-head">
          <div class="label"><span class="badge accent jp">問題${m.no}</span><span class="badge">${SECTION_VI[m.section]}</span></div>
          <div class="instr">${richStem(m.instruction)}</div>
          ${m.instruction_vi ? `<div class="instr-vi">${esc(m.instruction_vi)}</div>` : ''}
        </div>
        <div class="qa-wrap ${passages.length ? 'with-passage' : ''}">
          ${passages.length ? `<div class="passages">${passageHtml}</div>` : ''}
          <div>
            <div class="card question">
              <div class="stem"><span class="qnum">${q.num}</span>${richStem(q.stem)}</div>
              <div class="options">${optsHtml}</div>
              <div class="q-actions">
                <button class="btn" data-prev ${S.idx === 0 ? 'disabled' : ''}>← Câu trước</button>
                <span class="mid-actions">
                  ${canReveal ? '<button class="btn small reveal-btn" data-reveal>👁 Hiện đáp án</button>' : ''}
                  <button class="btn ghost small" data-flag>${S.flags.has(q.id) ? '★ Bỏ đánh dấu' : '☆ Đánh dấu'}</button>
                </span>
                <button class="btn ${rev || S.mode === 'exam' ? 'primary' : ''}" data-next ${isLast ? 'disabled' : ''}>Câu sau →</button>
              </div>
              <div class="hint" style="margin-top:10px">Phím tắt: ${study ? '' : '<kbd>1</kbd>–<kbd>4</kbd> chọn · '}<kbd>←</kbd> <kbd>→</kbd> chuyển câu · <kbd>Enter</kbd> câu sau${canReveal ? ' · <kbd>H</kbd> hiện đáp án' : ''} · <kbd>F</kbd> đánh dấu</div>
            </div>
            ${rev ? explanationHtml(q, rev, chosen, S.finished && chosen == null) : ''}
          </div>
        </div>
      </section>
    </div>
    <div class="mobile-nav">
      <button class="btn" data-prev ${S.idx === 0 ? 'disabled' : ''}>←</button>
      <button class="btn primary" data-next ${isLast ? 'disabled' : ''}>Câu sau →</button>
    </div>`;

  const t = document.getElementById('timer');
  if (t) updateTimer(t);
  $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(Number(b.dataset.go)));
  $app.querySelectorAll('[data-opt]').forEach((b) => b.onclick = () => choose(Number(b.dataset.opt)));
  $app.querySelectorAll('[data-prev]').forEach((b) => b.onclick = () => go(S.idx - 1));
  $app.querySelectorAll('[data-next]').forEach((b) => b.onclick = () => go(S.idx + 1));
  $app.querySelector('[data-flag]').onclick = () => toggleFlag(q.id);
  const fin = $app.querySelector('[data-finish]');
  if (fin) fin.onclick = () => confirmFinish();
  const rb = $app.querySelector('[data-reveal]');
  if (rb) rb.onclick = () => revealAnswer();
  const tp = $app.querySelector('[data-to-practice]');
  if (tp) tp.onclick = async () => {
    const a = S.data.attempt;
    try {
      const r = await api('/api/attempts', { method: 'POST', body: { examId: a.exam_id, mode: 'practice', sections: a.sections.split(',') } });
      location.hash = `#/attempt/${r.id}`;
    } catch (e) { toast(e.message); }
  };
  const cur = $app.querySelector('.qbtn.current');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
  const mk = $app.querySelector('.passage mark');
  if (mk) mk.scrollIntoView({ block: 'center', behavior: 'smooth' });

  keyHandler = (e) => {
    if (['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); choose(Number(e.key)); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(S.idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(S.idx - 1); }
    else if (e.key === 'f' || e.key === 'F') toggleFlag(q.id);
    else if (e.key === 'h' || e.key === 'H') revealAnswer();
  };
}

async function revealAnswer() {
  if (!S || S.busy || S.finished || S.mode !== 'practice') return;
  const att = S;
  const q = S.flat[S.idx];
  if (S.reveal[q.id]) return;
  att.busy = true;
  try {
    const r = await api(`/api/attempts/${att.id}/reveal`, { method: 'POST', body: { questionId: q.id } });
    att.reveal[q.id] = { id: r.id, num: r.num, answer: r.answer, explanation: r.explanation };
    if (r.choice != null) att.answers[q.id] = r.choice;
    if (S !== att) return;
    drawAttempt();
    const ex = $app.querySelector('.explain');
    if (ex && window.innerWidth < 960) ex.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { toast(e.message); } finally { att.busy = false; }
}

function go(i) {
  if (i < 0 || i >= S.flat.length) return;
  S.idx = i;
  history.replaceState(null, '', `#/attempt/${S.id}/q/${i}`);
  drawAttempt();
  window.scrollTo({ top: 0 });
}

async function choose(n) {
  if (!S || S.busy) return;
  const att = S;
  const q = S.flat[S.idx];
  if (S.reveal[q.id] || S.finished) return;
  if (S.mode === 'exam') {
    S.answers[q.id] = n;
    S.local[q.id] = n;
    store.set(`att:${S.id}`, S.local);
    drawAttempt();
    api(`/api/attempts/${S.id}/answer`, { method: 'POST', body: { questionId: q.id, choice: n, elapsed: S.elapsed } }).catch(() => {});
    return;
  }
  att.busy = true;
  try {
    const r = await api(`/api/attempts/${att.id}/answer`, { method: 'POST', body: { questionId: q.id, choice: n, elapsed: att.elapsed } });
    att.answers[q.id] = r.choice;
    att.reveal[q.id] = { id: r.id, num: r.num, answer: r.answer, explanation: r.explanation };
    if (S !== att) return; // navigated away
    drawAttempt();
    const ex = $app.querySelector('.explain');
    if (ex && window.innerWidth < 960) ex.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { toast('Lỗi lưu đáp án: ' + e.message); } finally { att.busy = false; }
}

async function toggleFlag(qid) {
  if (!S) return;
  const att = S;
  const on = !att.flags.has(qid);
  try { await api('/api/flags', { method: 'POST', body: { questionId: qid, on } }); } catch (e) { return toast(e.message); }
  on ? att.flags.add(qid) : att.flags.delete(qid);
  toast(on ? 'Đã đánh dấu câu này' : 'Đã bỏ đánh dấu');
  if (S === att) drawAttempt();
}

function confirmFinish() {
  const left = S.flat.filter((q) => S.answers[q.id] == null).length;
  modal(`<h3>${S.mode === 'exam' ? 'Nộp bài?' : 'Kết thúc luyện tập?'}</h3>
    <p>${left ? `Còn <b>${left}</b> câu chưa làm — sẽ tính là sai.` : 'Bạn đã làm hết các câu.'}</p>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="btn ghost" data-close>Làm tiếp</button><button class="btn primary" data-ok>Nộp & chấm điểm</button></div>`, (m) => {
    m.querySelector('[data-close]').onclick = closeModal;
    m.querySelector('[data-ok]').onclick = () => { closeModal(); finishAttempt(); };
  });
}

async function finishAttempt() {
  if (!S || S.finished) return;
  const att = S;
  clearInterval(timerHandle);
  timerHandle = null;
  try {
    await api(`/api/attempts/${att.id}/finish`, { method: 'POST', body: { answers: att.mode === 'exam' ? att.answers : null, elapsed: att.elapsed } });
    att.finished = true;
    try { localStorage.removeItem(`att:${att.id}`); } catch { /* ignore */ }
    if (S === att) location.hash = `#/attempt/${att.id}/result`;
  } catch (e) { toast('Lỗi nộp bài: ' + e.message); }
}

// highlight the evidence sentence(s) inside an escaped passage
function highlight(html, evidence) {
  if (!evidence) return html;
  const ev = plain(evidence);
  const pieces = ev.split(/[\n「」『』…]+|(?<=。)/).map((s) => s.trim()).filter((s) => s.length >= 6);
  for (const piece of pieces) {
    const e = esc(piece);
    const i = html.indexOf(e);
    if (i >= 0) html = html.slice(0, i) + '<mark>' + e + '</mark>' + html.slice(i + e.length);
  }
  return html;
}

function explanationHtml(q, rev, chosen, skipped = false) {
  const ex = rev.explanation || {};
  const right = rev.answer;
  const verdict = chosen == null ? 'neutral' : chosen === right ? 'ok' : 'bad';
  const vText = chosen == null ? (skipped ? 'Bỏ trống' : '📖 Đáp án') : chosen === right ? '✓ Chính xác!' : `✗ Chưa đúng — bạn chọn ${chosen}`;
  const notes = Array.isArray(ex.options) ? ex.options : [];
  const g = ex.grammar;
  return `<div class="explain">
    <div class="verdict ${verdict}">${vText}<span>· Đáp án đúng: <b>${right}</b></span>
      <span class="ans">${rich(q.options[right - 1])}</span></div>
    <div class="ex-body">
      ${ex.translation ? `<div class="ex-sec"><div class="h">Dịch nghĩa</div><p class="translation">${esc(ex.translation)}</p></div>` : ''}
      ${ex.why ? `<div class="ex-sec"><div class="h">Vì sao chọn ${right}</div><div class="why">${rich(ex.why)}</div></div>` : ''}
      ${ex.evidence ? `<div class="ex-sec"><div class="h">Căn cứ trong bài đọc</div><div class="evidence">${rich(ex.evidence)}</div></div>` : ''}
      ${g && (g.pattern || g.meaning) ? `<div class="ex-sec"><div class="h">Ngữ pháp</div><div class="grammar-box">
        ${g.pattern ? `<div class="pat">${esc(g.pattern)}</div>` : ''}
        ${g.meaning ? `<div><b>Nghĩa:</b> ${esc(g.meaning)}</div>` : ''}
        ${g.form ? `<div><b>Cách dùng:</b> <span class="jp">${esc(g.form)}</span></div>` : ''}
        ${g.example ? `<div><b>Ví dụ:</b> <span class="jp">${esc(g.example)}</span></div>` : ''}
      </div></div>` : ''}
      ${notes.length ? `<div class="ex-sec"><div class="h">Phân tích từng đáp án</div><ul class="opt-notes">
        ${notes.map((n, i) => `<li class="${i + 1 === right ? 'right' : i + 1 === chosen ? 'chosen' : ''}">
          <span class="n">${i + 1}</span><span>${rich(String(n).replace(/^\s*[1-4][\.\):：、]\s*/, ''))}</span></li>`).join('')}
      </ul></div>` : ''}
      ${ex.vocab && ex.vocab.length ? `<div class="ex-sec"><div class="h">Từ vựng</div>
        <table class="vocab-table"><thead><tr><th>Từ</th><th>Cách đọc</th><th>Hán Việt</th><th>Nghĩa</th></tr></thead><tbody>
        ${ex.vocab.map((v) => `<tr><td class="w">${esc(v.w)}</td><td class="r">${esc(v.r)}</td><td class="hv">${esc(v.hv)}</td>
          <td>${esc(v.vi)}<span class="src ${v.src}">${SRC_LABEL[v.src] || ''}</span>${v.note ? `<div class="hint">${esc(v.note)}</div>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
      ${ex.tip ? `<div class="ex-sec"><div class="h">Mẹo nhớ</div><div class="tip">💡 ${rich(ex.tip)}</div></div>` : ''}
    </div></div>`;
}

// ───────────── result ─────────────
function renderResult() {
  const sum = S.data.summary;
  const p = pct(sum.correct, sum.total);
  const cls = p >= 70 ? 'ok' : p >= 50 ? 'warn' : 'bad';
  $app.innerHTML = `
    <div class="card">
      <div class="result-hero">
        <div><div class="big-score">${sum.correct}<small> / ${sum.total}</small></div>
          <div style="margin-top:6px"><span class="badge ${cls}">${p}% chính xác</span>
          ${sum.elapsed_sec ? `<span class="badge">⏱ ${fmtTime(sum.elapsed_sec)}</span>` : ''}</div></div>
        <div class="sec-bars">${sum.sections.map((s) => `
          <div class="sec-bar"><div class="row"><b class="jp">${s.label}</b><span>${s.correct}/${s.total} · ${pct(s.correct, s.total)}%</span></div>
          <div class="progress"><div style="width:${pct(s.correct, s.total)}%"></div></div></div>`).join('')}
          <div class="hint">Mức tham khảo: N2 cần tổng ≥ 90/180 điểm và mỗi phần ≥ 19/60. Tỉ lệ đúng ~60–65% ở phần đọc + ngôn ngữ là mức an toàn.</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px">
        <a class="btn primary" href="#/attempt/${S.id}/q/${Math.max(0, S.flat.findIndex((q) => qState(q) === 'bad'))}">Xem lại câu sai</a>
        <button class="btn" data-retry>↻ Làm lại đề này</button>
        <a class="btn ghost" href="#/">← Danh sách đề</a>
      </div>
    </div>
    <h2>Chi tiết từng câu <span class="hint">(bấm để xem giải thích)</span></h2>
    <div class="filters" style="margin-bottom:12px">
      <button class="chip on" data-rf="all">Tất cả</button><button class="chip" data-rf="bad">Sai / bỏ trống</button><button class="chip" data-rf="ok">Đúng</button>
    </div>
    <div class="review-list">${S.flat.map((q, i) => {
      const st = qState(q) === 'ok' ? 'ok' : 'bad';
      const ch = S.answers[q.id];
      const rev = S.reveal[q.id];
      return `<div class="card review-item" data-st="${st}" data-go="${i}">
        <div class="head"><span class="badge ${st}">${st === 'ok' ? '✓' : '✗'} Câu ${q.num}</span>
          <span class="badge jp">問題${q.mondai.no}</span>
          <span class="hint">Bạn chọn: ${ch ?? '—'} · Đáp án: ${rev ? rev.answer : '?'}</span></div>
        <div class="stem">${esc(plain(q.stem)).slice(0, 300)}</div></div>`;
    }).join('')}</div>`;
  $app.querySelectorAll('[data-go]').forEach((el) => el.onclick = () => { location.hash = `#/attempt/${S.id}/q/${el.dataset.go}`; });
  $app.querySelectorAll('[data-rf]').forEach((b) => b.onclick = () => {
    $app.querySelectorAll('[data-rf]').forEach((x) => x.classList.toggle('on', x === b));
    $app.querySelectorAll('.review-item').forEach((el) => { el.style.display = b.dataset.rf === 'all' || el.dataset.st === b.dataset.rf ? '' : 'none'; });
  });
  $app.querySelector('[data-retry]').onclick = async () => {
    const a = S.data.attempt;
    const r = await api('/api/attempts', { method: 'POST', body: { examId: a.exam_id, mode: a.mode, sections: a.sections.split(',') } });
    location.hash = `#/attempt/${r.id}`;
  };
}

// ───────────── wrong answers / flags ─────────────
async function renderReviewList(kind) {
  $app.innerHTML = '<div class="loading">Đang tải…</div>';
  const items = await api(kind === 'wrong' ? '/api/review/wrong' : '/api/flags');
  const title = kind === 'wrong' ? 'Ôn lại câu sai' : 'Câu đã đánh dấu';
  const sub = kind === 'wrong' ? 'Những câu bạn làm sai ở lần gần nhất — đọc lại giải thích để nhớ lâu.' : 'Các câu bạn đã đánh dấu ☆ khi làm bài.';
  $app.innerHTML = `<h1>${title}</h1><p class="sub">${sub} (${items.length} câu)</p>
    ${items.length ? '' : '<div class="empty">Chưa có câu nào.</div>'}
    <div class="review-list">${items.map((it) => {
      const passages = it.passage ? it.passages.filter((p) => it.passage === 'AB' ? ['A', 'B'].includes(p.id) : p.id === it.passage) : [];
      const q = { options: it.options };
      return `<details class="card">
        <summary><div class="head" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span class="badge accent">${esc(it.exam_id)}</span><span class="badge jp">問題${it.mondai_no}</span><span class="badge">Câu ${it.num}</span>
          ${kind === 'wrong' ? `<span class="badge bad">Bạn chọn ${it.choice}</span>` : ''}<span class="badge ok">Đáp án ${it.answer}</span></div>
          <div class="stem jp" style="margin-top:6px;white-space:pre-wrap">${richStem(it.stem)}</div></summary>
        <div style="margin-top:10px">
          ${passages.map((p) => `<details><summary class="hint">Xem bài đọc ${esc(p.label || '')}</summary><div class="passage card" style="position:static;max-height:50vh">${highlight(rich(p.text), it.explanation.evidence)}</div></details>`).join('')}
          <div class="options" style="margin-top:8px">${it.options.map((o, i) => `<div class="option ${i + 1 === it.answer ? 'correct' : i + 1 === it.choice ? 'wrong' : ''}"><span class="key">${i + 1}</span><span>${rich(o)}</span></div>`).join('')}</div>
          ${explanationHtml(q, it, kind === 'wrong' ? it.choice : null)}
          ${kind === 'flags' ? `<button class="btn small" style="margin-top:10px" data-unflag="${it.id}">Bỏ đánh dấu</button>` : ''}
        </div></details>`;
    }).join('')}</div>`;
  $app.querySelectorAll('[data-unflag]').forEach((b) => b.onclick = async () => {
    await api('/api/flags', { method: 'POST', body: { questionId: b.dataset.unflag, on: false } });
    renderReviewList('flags');
  });
}

// ───────────── vocab ─────────────
async function renderVocab() {
  $app.innerHTML = `<h1>Từ vựng trong đề</h1>
    <p class="sub">Tổng hợp từ các phần giải thích. Ưu tiên nghĩa từ <span class="src list">List N2</span> của bạn → <span class="src mazii">Mazii</span> → giải thích soạn sẵn.</p>
    <input class="search" id="vq" placeholder="Tìm theo chữ Hán, cách đọc, Hán Việt hoặc nghĩa…" value="${esc(store.get('vq', ''))}">
    <div id="vlist" style="margin-top:14px"><div class="loading">Đang tải…</div></div>`;
  const input = document.getElementById('vq');
  let t;
  const load = async () => {
    store.set('vq', input.value);
    const rows = await api('/api/vocab?q=' + encodeURIComponent(input.value.trim()));
    document.getElementById('vlist').innerHTML = rows.length ? `<table class="table vocab-table"><thead><tr>
      <th>Từ</th><th>Cách đọc</th><th>Hán Việt</th><th>Nghĩa</th><th>Số lần</th></tr></thead><tbody>
      ${rows.map((v) => `<tr><td class="w">${esc(v.w)}</td><td class="r">${esc(v.r)}</td><td class="hv">${esc(v.hv)}</td>
        <td>${esc(v.vi)}<span class="src ${v.src}">${SRC_LABEL[v.src]}</span></td><td title="${esc(v.exams.join(', '))}">${v.freq}</td></tr>`).join('')}
      </tbody></table><p class="hint">Hiển thị tối đa 500 từ.</p>` : '<div class="empty">Không tìm thấy.</div>';
  };
  input.oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  load();
}

// ───────────── stats ─────────────
async function renderStats() {
  $app.innerHTML = '<div class="loading">Đang tải…</div>';
  const [st, hist] = await Promise.all([api('/api/stats'), api('/api/history')]);
  const sec = Object.fromEntries(st.bySection.map((s) => [s.section, s]));
  $app.innerHTML = `<h1>Thống kê</h1><p class="sub">Database: ${st.content.exams} đề · ${st.content.questions} câu</p>
    <div class="stat-grid">
      <div class="card stat"><div class="v">${st.totals.finished || 0}</div><div class="l">Lượt hoàn thành / ${st.totals.attempts || 0} lượt</div></div>
      ${['vocab', 'grammar', 'reading'].map((k) => {
        const s = sec[k] || { total: 0, correct: 0 };
        return `<div class="card stat"><div class="v">${pct(s.correct, s.total)}%</div><div class="l jp">${SECTION[k]} · ${s.correct || 0}/${s.total} câu</div>
          <div class="progress" style="margin-top:8px"><div style="width:${pct(s.correct, s.total)}%"></div></div></div>`;
      }).join('')}
    </div>
    <h2>Theo dạng bài (問題)</h2>
    ${st.byMondai.length ? `<table class="table"><thead><tr><th>Dạng</th><th>Phần</th><th>Đúng</th><th>Tỉ lệ</th></tr></thead><tbody>
      ${st.byMondai.map((m) => `<tr><td class="jp">問題${m.no}</td><td>${SECTION_VI[m.section]}</td><td>${m.correct}/${m.total}</td>
        <td style="min-width:140px"><div class="progress"><div style="width:${pct(m.correct, m.total)}%;background:${pct(m.correct, m.total) >= 60 ? 'var(--ok)' : 'var(--bad)'}"></div></div> ${pct(m.correct, m.total)}%</td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">Chưa có dữ liệu — hãy làm một đề.</div>'}
    <h2>Lịch sử làm bài</h2>
    ${hist.length ? `<table class="table"><thead><tr><th>Đề</th><th>Chế độ</th><th>Phần</th><th>Kết quả</th><th>Bắt đầu</th><th></th></tr></thead><tbody>
      ${hist.map((h) => `<tr><td>${esc(h.title)}</td><td>${MODE_LABEL[h.mode] || h.mode}</td>
        <td class="jp">${h.sections.split(',').map((s) => SECTION[s]).join(' · ')}</td>
        <td>${h.finished_at ? `<b>${h.score}/${h.total}</b> (${pct(h.score, h.total)}%)` : h.mode === 'study' ? '<span class="badge">Không chấm</span>' : '<span class="badge warn">Đang làm</span>'}</td>
        <td>${new Date(h.started_at).toLocaleString('vi-VN')}</td>
        <td><a href="#/attempt/${h.id}${h.finished_at ? '/result' : ''}">${h.finished_at ? 'Xem' : 'Làm tiếp'}</a>
          · <a href="#" data-del="${h.id}" style="color:var(--muted)">Xoá</a></td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">Chưa có lượt làm bài nào.</div>'}`;
  $app.querySelectorAll('[data-del]').forEach((a) => a.onclick = (e) => {
    e.preventDefault();
    modal(`<h3>Xoá lượt làm bài này?</h3><p>Kết quả và đáp án của lượt này sẽ bị xoá khỏi database.</p>
      <div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn ghost" data-close>Huỷ</button><button class="btn primary" data-ok>Xoá</button></div>`, (m) => {
      m.querySelector('[data-close]').onclick = closeModal;
      m.querySelector('[data-ok]').onclick = async () => { await api(`/api/attempts/${a.dataset.del}`, { method: 'DELETE' }); closeModal(); renderStats(); };
    });
  });
}

route();
