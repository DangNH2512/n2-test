"""Extract exam PDF text line-by-line, marking underlined chars with <u>..</u>
and empty underline blanks (no text above) as ＿＿＿.
Usage: python extract.py in.pdf out.txt
"""
import sys
import pymupdf


def thin_hrects(page):
    out = []
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "re":
                r = it[1]
            elif it[0] == "l":
                p1, p2 = it[1], it[2]
                if abs(p1.y - p2.y) > 1:
                    continue
                r = pymupdf.Rect(min(p1.x, p2.x), p1.y - 0.3, max(p1.x, p2.x), p1.y + 0.3)
            else:
                continue
            if r.height <= 1.6 and r.width >= 4:
                out.append(pymupdf.Rect(r))
    return out


def main(src, dst):
    doc = pymupdf.open(src)
    lines_out = []
    for pno, page in enumerate(doc):
        rects = thin_hrects(page)
        used = [False] * len(rects)
        raw = page.get_text("rawdict")
        lines = []
        for b in raw["blocks"]:
            if b.get("type") != 0:
                continue
            for l in b["lines"]:
                chars = []
                for s in l["spans"]:
                    for c in s["chars"]:
                        chars.append((c["c"], pymupdf.Rect(c["bbox"])))
                if not chars:
                    continue
                y0 = min(r.y0 for _, r in chars)
                y1 = max(r.y1 for _, r in chars)
                lines.append([y0, y1, chars])
        # merge lines that share the same baseline band
        lines.sort(key=lambda x: (round((x[0] + x[1]) / 2), x[2][0][1].x0))
        merged = []
        for ln in lines:
            if merged:
                m = merged[-1]
                mid = (ln[0] + ln[1]) / 2
                if m[0] - 2 <= mid <= m[1] + 2:
                    m[0] = min(m[0], ln[0]); m[1] = max(m[1], ln[1]); m[2].extend(ln[2])
                    continue
            merged.append([ln[0], ln[1], list(ln[2])])
        page_lines = []
        for y0, y1, chars in merged:
            chars.sort(key=lambda t: t[1].x0)
            toks = []  # (x0, text, underlined)
            for ch, r in chars:
                ul = False
                for i, rr in enumerate(rects):
                    if r.y1 - 4 <= rr.y0 <= r.y1 + 5:
                        ov = min(r.x1, rr.x1) - max(r.x0, rr.x0)
                        if ov > 0.5 * max(r.width, 1):
                            ul = True
                            used[i] = True
                toks.append((r.x0, r.x1, ch, ul))
            page_lines.append([y0, y1, toks])
        # blanks: underline rects with no char above, attach to nearest line by y
        for i, rr in enumerate(rects):
            if used[i] or rr.width < 12:
                continue
            best = None
            for pl in page_lines:
                if pl[1] - 4 <= rr.y0 <= pl[1] + 6:
                    best = pl
                    break
            if best is not None:
                # skip table/box borders: those usually span over existing chars horizontally
                covered = any(min(t[1], rr.x1) - max(t[0], rr.x0) > 0 for t in best[2])
                if not covered:
                    best[2].append((rr.x0, rr.x1, "＿＿＿", False))
        page_lines.sort(key=lambda x: x[0])
        lines_out.append(f"\n===== PAGE {pno + 1} =====")
        for y0, y1, toks in page_lines:
            toks.sort(key=lambda t: t[0])
            s = ""
            in_u = False
            prev_x1 = None
            for x0, x1, ch, ul in toks:
                if ch.strip() and not ch.isdigit() and ul and not in_u:
                    s += "<u>"; in_u = True
                elif in_u and (not ul or ch.isdigit()):
                    s += "</u>"; in_u = False
                if prev_x1 is not None and x0 - prev_x1 > 8 and not in_u:
                    s += "  "
                s += ch
                prev_x1 = x1
            if in_u:
                s += "</u>"
            s = s.replace("<u></u>", "")
            if s.strip():
                lines_out.append(s.rstrip())
    with open(dst, "w", encoding="utf-8") as f:
        f.write("\n".join(lines_out) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
