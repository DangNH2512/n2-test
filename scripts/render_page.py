"""Render one exam PDF page to PNG. Usage: scripts/venv-python scripts/render_page.py <examId> <pageNo(1-based)>"""
import os, sys, warnings
warnings.filterwarnings("ignore")
import pymupdf
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
exam, pno = sys.argv[1], int(sys.argv[2])
doc = pymupdf.open(os.path.join(root, "data", "source", "pdf", f"{exam}.pdf"))
out = os.path.join(root, ".cache", "pages", f"{exam}-p{pno}.png")
doc[pno - 1].get_pixmap(dpi=110).save(out)
print(out)
