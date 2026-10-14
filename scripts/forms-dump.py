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

# Flat forms (no fillable boxes): every printed line with its position in pdf-lib coordinates (origin bottom-left), and
# the underscores/blank rules people write on, so a map can place each answer with {"at": {page, x, y, w}}.
if not any(True for p in doc for _ in p.widgets()):
    print("\n# no fillable boxes: printed lines (x0, y_baseline_from_bottom, x1) and blank rules")
    for p in doc:
        H = p.rect.height
        for b in p.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                txt = "".join(s["text"] for s in l["spans"]).strip()
                if not txt: continue
                x0, y0, x1, y1 = l["bbox"]
                print(f"p{p.number} ({x0:.0f},{H - y1 + 2:.0f},{x1:.0f}) {txt[:140]}")
        for d in p.get_drawings():
            for it in d["items"]:
                if it[0] == "l":
                    a, c = it[1], it[2]
                    if abs(a.y - c.y) < 0.5 and abs(c.x - a.x) > 30:
                        print(f"p{p.number} rule x={min(a.x, c.x):.0f}..{max(a.x, c.x):.0f} y={H - a.y:.0f}")
                elif it[0] == "re":
                    r = it[1]
                    if 6 <= r.width <= 14 and 6 <= r.height <= 14:
                        print(f"p{p.number} box x={r.x0:.0f} y={H - r.y1:.0f} (checkbox {r.width:.0f}x{r.height:.0f})")
