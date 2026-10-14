"""Lists every fillable box on an agency PDF with the printed words around it, for writing src/forms/maps/<id>.json.
   python3 scripts/forms-dump.py public/forms/tx-205.pdf"""
import sys, pymupdf as fitz

KIND = {fitz.PDF_WIDGET_TYPE_TEXT: "text", fitz.PDF_WIDGET_TYPE_CHECKBOX: "check", fitz.PDF_WIDGET_TYPE_RADIOBUTTON: "radio",
        fitz.PDF_WIDGET_TYPE_COMBOBOX: "choice", fitz.PDF_WIDGET_TYPE_LISTBOX: "choice", fitz.PDF_WIDGET_TYPE_SIGNATURE: "signature",
        fitz.PDF_WIDGET_TYPE_BUTTON: "button"}

def near(words, r, dx=230, dy=26):
    left = [w for w in words if w[2] <= r.x0 + 2 and abs((w[1] + w[3]) / 2 - (r.y0 + r.y1) / 2) < max(7, r.height / 2) and r.x0 - w[2] < dx]
    above = [w for w in words if w[3] <= r.y0 + 2 and r.y0 - w[3] < dy and w[0] < r.x1 and w[2] > r.x0 - 10]
    right = [w for w in words if w[0] >= r.x1 - 2 and abs((w[1] + w[3]) / 2 - (r.y0 + r.y1) / 2) < max(7, r.height / 2) and w[0] - r.x1 < 160]
    j = lambda ws: " ".join(w[4] for w in sorted(ws, key=lambda w: (round(w[1]), w[0])))
    return j(left)[-90:], j(above)[-110:], j(right)[:90]

doc = fitz.open(sys.argv[1])
print(f"# {sys.argv[1]}  pages={doc.page_count}  page size={tuple(round(x) for x in doc[0].rect[2:])} (PDF points, origin top-left here; pdf-lib y = height - y)")
for p in doc:
    words = p.get_text("words")
    for w in p.widgets():
        k = KIND.get(w.field_type, str(w.field_type))
        r = w.rect
        l, a, rt = near(words, r)
        extra = ""
        if k in ("check", "radio"): extra = f" on={w.on_state()!r}"
        if k == "choice": extra = f" options={w.choice_values!r}"[:300]
        if w.text_maxlen: extra += f" max={w.text_maxlen}"
        tip = (w.field_label or "").replace("\n", " ")[:160]
        print(f"p{p.number} {k:6} {w.field_name!r}{extra} rect=({r.x0:.0f},{r.y0:.0f},{r.x1:.0f},{r.y1:.0f})")
        if tip: print(f"      tip: {tip}")
        print(f"      left: {l} | above: {a} | right: {rt}")
