# N2 exam data — part file schema

One JSON file per 問題 (mondai) block, per exam:

```
data/parts/<examId>/m<NN>.json      e.g. data/parts/2024-07/m01.json … m14.json
```

`<examId>` = `YYYY-MM` (e.g. `2024-07`). Only 問題1–問題14 of 言語知識 (文字・語彙, 文法)
and 読解. **Skip 聴解 (listening) entirely.**

Sources:
- `data/source/txt/<examId>.txt` — text extracted from the exam PDF. Underlined text is
  wrapped as `<u>…</u>`. Empty underline blanks may appear as `＿＿＿` or just spaces.
- `data/source/pdf/<examId>.pdf` — the original PDF. If a page looks incomplete in the txt
  (tables, images, ★ blanks), render it and look at it:
  `scripts/venv-python scripts/render_page.py <examId> <pageNo>` → prints a PNG path, then Read it.
- `data/answer_key.json` — OFFICIAL answers: `key[examId].answers["<qnum>"]` (1–4).
  **The official answer is always the truth.** Your explanation must justify that answer.

## File format

```json
{
  "exam": "2024-07",
  "mondai": 1,
  "section": "vocab",
  "instruction": "＿＿＿の言葉の読み方として最もよいものを、1・2・3・4から一つ選びなさい。",
  "instruction_vi": "Chọn cách đọc đúng nhất cho từ được gạch chân.",
  "passages": [],
  "questions": [
    {
      "num": 1,
      "passage": null,
      "stem": "状況を<u>詳細</u>に書いてください。",
      "options": ["そうざい", "そうさい", "しょうざい", "しょうさい"],
      "answer": 4,
      "explanation": {
        "translation": "Hãy viết chi tiết về tình hình.",
        "why": "詳細 đọc là しょうさい (TƯỜNG TẾ) = chi tiết, tỉ mỉ. 詳 đọc âm On là しょう (không phải そう), 細 đọc là さい (không có biến âm thành ざい).",
        "options": [
          "そうざい → 惣菜: món ăn kèm làm sẵn. Sai.",
          "そうさい → 相殺: bù trừ, triệt tiêu. Sai.",
          "しょうざい → không có từ này. Sai.",
          "しょうさい → 詳細: chi tiết. ĐÚNG."
        ],
        "vocab": [
          { "w": "詳細", "r": "しょうさい", "hv": "TƯỜNG TẾ", "vi": "chi tiết, tỉ mỉ" },
          { "w": "状況", "r": "じょうきょう", "hv": "TRẠNG HUỐNG", "vi": "tình hình, tình trạng" }
        ],
        "grammar": null,
        "evidence": null,
        "tip": "詳 (しょう) hay bị nhầm với 洋/様 (よう). Nhớ: 詳しい (くわしい)."
      }
    }
  ]
}
```

### Field rules
- `section`: `"vocab"` (文字・語彙: 問題1–6), `"grammar"` (文法: 問題7–9), `"reading"` (読解: 問題10–14).
  Mondai numbering is the exam's own (問題1…問題14).
- `instruction`: the Japanese instruction line of that 問題, cleaned (no page headers).
- `stem`: question text. Keep `<u>…</u>` for underlined parts. For 問題3/4/7 blanks use `（　　）`.
  For 問題8 (★ ordering) write the sentence with blanks like `＿＿＿ ＿＿＿ ★ ＿＿＿ ＿＿＿`
  in the right positions (check the PDF page if unsure). For 問題6 (usage) the stem is the
  target word (e.g. `"ぎっしり"`) and the 4 options are the full sentences.
  For 問題9 (cloze passage) and reading, `stem` is the question text (e.g. `"48"` for a cloze slot
  becomes `"（48）に入るもの"`; for reading `"筆者によると、…はなぜか。"`).
- `options`: exactly 4 strings, in order 1–4, no leading numbers.
- `answer`: integer 1–4, **must equal the official key**.
- `passages`: reading/cloze passages of this 問題: `[{ "id": "p1", "label": "(1)", "text": "…" }]`.
  Copy the full Japanese text faithfully (paragraph breaks as `\n`, keep `<u>…</u>`, keep 注 notes).
  Questions reference a passage via `"passage": "p1"`. 問題12 A/B → two passages `"A"`,`"B"` and
  questions use `"passage": "AB"` (UI shows both). 問題14 info sheet → one passage (tables may be
  rewritten as simple lines `項目：内容`), plus any table that belongs to the question goes in the stem.
- `explanation` (ALL in Vietnamese except Japanese words) — required for every question:
  - `translation`: Vietnamese translation of the sentence/question (with the correct answer filled in).
  - `why`: 1–4 sentences, why the official answer is correct. Be concrete (meaning, kanji reading rule,
    grammar meaning/connection, or the exact passage logic).
  - `options`: array of 4 short notes, one per option (reading / meaning / why wrong). Mark the right one `ĐÚNG`.
  - `vocab`: key words (target word + 1–4 useful words in the sentence/options):
    `{ "w": kanji/word, "r": kana reading, "hv": "HÁN VIỆT" (uppercase, "" if none), "vi": Vietnamese meaning }`.
  - `grammar`: for grammar questions (and reading when useful):
    `{ "pattern": "～ざるを得ない", "meaning": "buộc phải, đành phải", "form": "Vない(bỏ ない)+ざるを得ない", "example": "…" }`, else `null`.
  - `evidence`: reading questions only — the exact Japanese sentence(s) from the passage proving the answer, else `null`.
  - `tip`: optional short memory tip / trap warning, or `null`.

Write valid JSON (UTF-8, no comments, no trailing commas). Run the validator after each exam:

```
python3 scripts/validate_parts.py <examId>
```
