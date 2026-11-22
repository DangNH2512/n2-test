"""Parse the official answer key PDF into {examId: {qnum: answer}} using word coordinates.
Only non-listening sections (stops at 聴解).
Usage: python parse_key.py dapan.pdf out.json
"""
import json
import re
import unicodedata
import sys
import pymupdf


def main(src, dst):
    doc = pymupdf.open(src)
    result = {}
    for page in doc:
        text = page.get_text()
        m = re.search(r"JLPT\s*N2\s*(\d{1,2})\s*/\s*(\d{4})", text)
        if not m:
            continue
        exam_id = f"{m.group(2)}-{int(m.group(1)):02d}"
        words = page.get_text("words")
        # find y of 聴解 heading to cut listening
        cut_y = None
        for w in words:
            if "聴解" in w[4]:
                cut_y = w[1]
        words = [w for w in words if cut_y is None or w[1] < cut_y - 1]
        # group into lines by y center
        lines = []
        for w in sorted(words, key=lambda w: ((w[1] + w[3]) / 2, w[0])):
            yc = (w[1] + w[3]) / 2
            if lines and abs(lines[-1][0] - yc) < 3:
                lines[-1][1].append(w)
            else:
                lines.append([yc, [w]])
        nums = []  # per line: list of (xc, int)
        for yc, ws in lines:
            toks = []
            for w in ws:
                t = unicodedata.normalize("NFKC", w[4])
                if re.fullmatch(r"[0-9]{1,2}", t):
                    toks.append(((w[0] + w[2]) / 2, int(t), w))
            nums.append((yc, toks))
        answers = {}
        for i, (yc, toks) in enumerate(nums):
            if i + 1 >= len(nums):
                break
            nyc, ntoks = nums[i + 1]
            if nyc - yc > 30:
                continue
            for xc, v, w in toks:
                below = [t for t in ntoks if abs(t[0] - xc) < 7 and 1 <= t[1] <= 4]
                if len(below) == 1 and 1 <= v <= 80:
                    if v not in answers:
                        answers[v] = below[0][1]
        # keep contiguous run 1..N
        out = {}
        n = 1
        while n in answers:
            out[n] = answers[n]
            n += 1
        result[exam_id] = {"count": len(out), "answers": out, "extra": sorted(set(answers) - set(out))}
    json.dump(result, open(dst, "w"), ensure_ascii=False, indent=1)
    for k, v in sorted(result.items()):
        print(k, v["count"], "extra:", v["extra"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
