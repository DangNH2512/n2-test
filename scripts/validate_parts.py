#!/usr/bin/env python3
"""Validate data/parts/<examId>/m*.json against docs/DATA_SCHEMA.md and the official key.
Usage: python3 scripts/validate_parts.py <examId> [<examId> ...]   (or "all")
Exit code 1 if any error.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = json.load(open(os.path.join(ROOT, "data", "answer_key.json"), encoding="utf-8"))
SECTION_OF = {**{i: "vocab" for i in range(1, 7)}, **{i: "grammar" for i in range(7, 10)},
              **{i: "reading" for i in range(10, 15)}}


def validate(exam):
    errs, warns = [], []
    d = os.path.join(ROOT, "data", "parts", exam)
    key = KEY.get(exam)
    if not key:
        return [f"{exam}: not in answer key"], []
    if not os.path.isdir(d):
        return [f"{exam}: no parts dir"], []
    seen = {}
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(d, fn)
        try:
            m = json.load(open(path, encoding="utf-8"))
        except Exception as e:  # noqa
            errs.append(f"{fn}: invalid JSON: {e}")
            continue
        mno = m.get("mondai")
        if m.get("exam") != exam:
            errs.append(f"{fn}: exam field {m.get('exam')!r} != {exam}")
        if mno not in SECTION_OF:
            errs.append(f"{fn}: bad mondai {mno!r}")
        elif m.get("section") != SECTION_OF[mno]:
            errs.append(f"{fn}: section {m.get('section')!r} should be {SECTION_OF[mno]}")
        for f in ("instruction", "instruction_vi"):
            if not m.get(f):
                errs.append(f"{fn}: missing {f}")
        pids = {p.get("id") for p in m.get("passages") or []}
        for p in m.get("passages") or []:
            if not p.get("text") or len(p["text"]) < 20:
                errs.append(f"{fn}: passage {p.get('id')} text too short")
        qs = m.get("questions") or []
        if not qs:
            errs.append(f"{fn}: no questions")
        for q in qs:
            n = q.get("num")
            tag = f"{fn} q{n}"
            if not isinstance(n, int):
                errs.append(f"{tag}: num must be int")
                continue
            if n in seen:
                errs.append(f"{tag}: duplicate (also in {seen[n]})")
            seen[n] = fn
            if not q.get("stem"):
                errs.append(f"{tag}: empty stem")
            opts = q.get("options")
            if not isinstance(opts, list) or len(opts) != 4 or not all(isinstance(o, str) and o.strip() for o in opts):
                errs.append(f"{tag}: options must be 4 non-empty strings")
            official = key["answers"].get(str(n))
            if official is None:
                errs.append(f"{tag}: question number not in official key (1..{key['count']})")
            elif q.get("answer") != official:
                errs.append(f"{tag}: answer {q.get('answer')} != official {official}")
            pas = q.get("passage")
            if pas and pas != "AB" and pas not in pids:
                errs.append(f"{tag}: passage {pas!r} not defined")
            if pas == "AB" and not {"A", "B"} <= pids:
                errs.append(f"{tag}: passage AB needs passages A and B")
            if SECTION_OF.get(mno) == "reading" and not pas:
                warns.append(f"{tag}: reading question without passage")
            ex = q.get("explanation") or {}
            for f in ("translation", "why"):
                if not ex.get(f) or len(ex[f]) < 8:
                    errs.append(f"{tag}: explanation.{f} missing/too short")
            eo = ex.get("options")
            if not isinstance(eo, list) or len(eo) != 4:
                errs.append(f"{tag}: explanation.options must have 4 notes")
            v = ex.get("vocab")
            if not isinstance(v, list):
                errs.append(f"{tag}: explanation.vocab must be a list")
            else:
                for it in v:
                    if not isinstance(it, dict) or not it.get("w") or "vi" not in it:
                        errs.append(f"{tag}: bad vocab item {it!r}")
                        break
            if SECTION_OF.get(mno) == "grammar" and mno in (7, 8) and not ex.get("grammar"):
                warns.append(f"{tag}: grammar question without explanation.grammar")
            if SECTION_OF.get(mno) == "reading" and not ex.get("evidence"):
                warns.append(f"{tag}: reading question without evidence")
    missing = [i for i in range(1, key["count"] + 1) if i not in seen]
    if missing:
        errs.append(f"missing questions: {missing}")
    return errs, warns


def main():
    args = sys.argv[1:]
    if not args or args == ["all"]:
        args = sorted(KEY)
    bad = False
    for exam in args:
        errs, warns = validate(exam)
        status = "OK" if not errs else "FAIL"
        print(f"[{status}] {exam}: {len(errs)} errors, {len(warns)} warnings")
        for e in errs[:40]:
            print("   ERROR", e)
        for w in warns[:10]:
            print("   warn ", w)
        bad = bad or bool(errs)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
