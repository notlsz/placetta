#!/usr/bin/env node
/* Fit check: opens every page of the app at phone, tablet and desktop widths and reports anything that doesn't fit
   on screen.

   Build and serve the app first (its base is /app/, so serve the folder above it):
     VITE_PREVIEW=1 npx vite build --outDir /tmp/fit/app && (cd /tmp/fit && python3 -m http.server 4920)
       the signed-in app on its in-browser stand-in backend (sign in with any email, code 123456)
     npx vite build --mode sample --outDir /tmp/fit-sample/app && (cd /tmp/fit-sample && python3 -m http.server 4921)
       the sample workspace, Moonleaf Tea, with stores, applications, budgets and drawers full of data
   Then:
     node scripts/fit-check.mjs --url http://localhost:4921/app/ --out /tmp/fit-out
     node scripts/fit-check.mjs --url http://localhost:4920/app/ --signin --out /tmp/fit-out-cloud

   Options: --widths 375,414,768,1024,1280  --height 800  --only <name substring>  --shots-all (screenshot every state)
            --scrollbars (show classic scrollbars, which headless Chromium hides)
   Playwright: set PLAYWRIGHT to its index.mjs if `import("playwright")` can't find it.

   On each page it flags:
     doc       the page scrolls sideways (documentElement.scrollWidth > innerWidth)
     offscreen a visible element whose right edge is past innerWidth+1 or left edge below -1, unless an ancestor
               with overflow-x auto, scroll, hidden or clip holds it (that ancestor is checked by "scroller")
     scroller  a box that scrolls or clips sideways because its content is too wide, unless it's meant to scroll
               sideways (a chip row, a tab strip, a table wrapper: see SIDEWAYS_OK)
     text      text that runs out of its own box without an ellipsis
   Findings go to <out>/findings.json, with a screenshot of each page that has any, the offenders outlined.
   Exits 1 when anything is found.

   --align: the same page states (at 375,414,768,1280,1440 unless --widths says otherwise), checked for alignment
   instead of fit:
     dialog    a modal, the tour card, the plans modal, ⌘K or a toast whose left and right gaps differ by more than
               2px (and top and bottom, for the ones centered both ways). A toast is centered over the content
               area, like the chatbar it sits above.
     center    a child of a centering box (flex column with align-items center, grid with justify-items center, flex
               row with justify-content center) or a line of text-align:center text, off its box's center by >2px
     icon      an icon (an svg up to 28px, or the small box holding only it) in a row whose single line of text it
               sits beside, off that line's center by more than 1.5px (to the first line when the row aligns to
               the top)
     column    a header, card or list in the main column (.page, its sections, the settings column) whose left
               edge is off its column's by more than 1px, unless it's indented on purpose (data-indent)
     dock      the chatbar not centered in the content area (the scrolling column, scrollbar excluded), or the
               line above it not centered on it
     overlap   in-flow siblings that overlap, an absolutely placed control over a sibling's text, or the chatbar
               covering the end of the page when it's scrolled to the bottom
     dropdown  a select or listbox trigger whose box doesn't match the shared field (.sel: height 34/38/46, radius
               12px, the 1px ring, font size for its height, room on the right for the chevron, no native arrow),
               or an open menu whose surface, items or position don't match the shared menu (.menu)
   Pages with dropdowns are also checked in dark mode (-dark). */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const flag = k => args.includes("--" + k);
const URL_ = opt("url", "http://localhost:4920/app/").replace(/\/?$/, "/");
const ALIGN = flag("align");
const OUT = opt("out", ALIGN ? "align-out" : "fit-out");
const WIDTHS = opt("widths", ALIGN ? "375,414,768,1280,1440" : "375,414,768,1024,1280").split(",").map(Number);
const HEIGHT = Number(opt("height", "800"));
const ONLY = opt("only", "");
const SIGNIN = flag("signin");
const SHOTS_ALL = flag("shots-all");

const { chromium } = await import(process.env.PLAYWRIGHT || "playwright").catch(() =>
  import("/home/claude/.npm-global/lib/node_modules/playwright/index.mjs"));

/* Boxes that are meant to scroll sideways: they stay inside the screen and their content scrolls within them. */
const SIDEWAYS_OK = [".set-nav", ".ptabs", ".gt-scroll", ".sugg", ".tscroll", "[data-hscroll]", "input", "textarea", "select", "pre"].join(",");

/* -------------------------------- what's checked, in the page -------------------------------- */
function check(SIDEWAYS_OK) {
  const W = window.innerWidth;
  const out = [], notes = [];
  const doc = document.documentElement.scrollWidth;
  if (doc > W) out.push({ kind: "doc", sel: "html", detail: `scrollWidth ${doc} > ${W}` });

  const sel = el => {
    const part = e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + [...e.classList].slice(0, 3).map(c => "." + c).join("");
    const p = []; for (let e = el; e && e !== document.body && p.length < 5; e = e.parentElement) p.unshift(part(e));
    return p.join(" > ");
  };
  const label = el => (el.getAttribute("aria-label") || el.textContent || el.value || "").replace(/\s+/g, " ").trim().slice(0, 70);
  const css = el => getComputedStyle(el);
  const visible = (el, cs) => {
    if (cs.visibility === "hidden" || cs.visibility === "collapse" || +cs.opacity === 0) return false;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = a === el ? cs : css(a);
      if (s.clip && s.clip !== "auto") return false;               // screen-reader-only text
      if (s.display === "contents") continue;
      if (+s.opacity === 0) return false;
    }
    return true;
  };
  const holder = (el, cs) => {   // the nearest ancestor that scrolls or clips sideways
    if (cs.position === "fixed") return null;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (a === document.body) return null;
      const s = css(a);
      if (/^(auto|scroll|hidden|clip)$/.test(s.overflowX)) return a;
      if (s.position === "fixed") return null;       // nothing above a fixed box clips it
    }
    return null;
  };
  const marked = new Set();
  const mark = (el, rec) => { el.setAttribute("data-fit", out.length); marked.add(el); out.push(rec); };
  const underMarked = el => { for (let a = el.parentElement; a; a = a.parentElement) if (marked.has(a)) return true; return false; };

  const all = document.body.querySelectorAll("*");
  for (const el of all) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    const cs = css(el);
    if (cs.display === "none" || cs.display === "contents") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (!visible(el, cs)) continue;
    // offscreen
    const h = holder(el, cs);
    if ((r.right > W + 1 || r.left < -1) && !h && !underMarked(el)) {
      mark(el, { kind: "offscreen", sel: sel(el), text: label(el), detail: `left ${Math.round(r.left)} right ${Math.round(r.right)} of ${W}` });
      continue;
    }
    // past the left edge of the box that holds it: no scrolling reaches that (scrollWidth doesn't count it either)
    if (h && !underMarked(el) && !marked.has(h)) {
      const hr = h.getBoundingClientRect();
      if (r.left + h.scrollLeft < hr.left - 1 && r.right > hr.left + 1 && !(h.matches(SIDEWAYS_OK) && h.scrollLeft > 0)) {
        mark(el, { kind: "offscreen", sel: sel(el), text: label(el), detail: `left ${Math.round(r.left)} is past the left edge ${Math.round(hr.left)} of ${sel(h).split(" > ").pop()}` });
        continue;
      }
    }
    // a strip that's meant to scroll sideways and does: not a failure, but listed so it can be looked at
    if (/^(auto|scroll)$/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.matches(SIDEWAYS_OK) && !el.matches("input, textarea, select, pre"))
      notes.push({ kind: "scrolls", sel: sel(el), text: label(el), detail: `scrollWidth ${el.scrollWidth} in ${el.clientWidth}` });
    // scroller
    if (/^(auto|scroll|hidden|clip)$/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && !el.matches(SIDEWAYS_OK)
        && !(cs.textOverflow === "ellipsis" && cs.whiteSpace.startsWith("nowrap")) && !underMarked(el)) {
      // ignore boxes whose only overflow is invisible (e.g. a transparent input stretched over a swatch to widen its hit area)
      const kids = [...el.querySelectorAll("*")].filter(k => {
        const kr = k.getBoundingClientRect(), ks = css(k);
        return kr.width >= 1 && kr.height >= 1 && ks.position !== "fixed" && visible(k, ks) && (kr.right > el.getBoundingClientRect().right + 1);
      });
      if (kids.length) {
        const k = kids[0];
        mark(el, { kind: "scroller", sel: sel(el), text: label(el), detail: `${cs.overflowX}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}; widest ${sel(k)} "${label(k).slice(0, 40)}"` });
        continue;
      }
    }
  }

  // A line's box can poke out by its trailing spaces (they hang past the edge in pre-wrap text, unseen): only a
  // visible character outside the box counts.
  const inkOutside = (n, br) => {
    const r = document.createRange();
    for (let i = 0; i < n.data.length; i++) {
      if (/\s/.test(n.data[i])) continue;
      r.setStart(n, i); r.setEnd(n, i + 1);
      const c = r.getBoundingClientRect();
      if (c.width > 0 && (c.right > br.right + 1.5 || c.left < br.left - 1.5)) return true;
    }
    return false;
  };
  // text: every run of text stays inside the block that holds it, unless that block ends it with an ellipsis
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.data.trim() ? 1 : 2 });
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    let box = n.parentElement;
    if (!box || box.closest("svg, script, style, textarea, select, option")) continue;
    const ps = css(box);
    if (!visible(box, ps)) continue;
    while (box && css(box).display.startsWith("inline") && !/^inline-(block|flex|grid)$/.test(css(box).display)) box = box.parentElement;
    if (!box || seen.has(box)) continue;
    const bs = css(box);
    if (bs.textOverflow === "ellipsis" && bs.overflowX !== "visible") continue;
    if (/^(auto|scroll)$/.test(bs.overflowX)) continue;
    const br = box.getBoundingClientRect();
    if (br.width < 1) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const tr of range.getClientRects()) {
      if (tr.width < 1) continue;
      if ((tr.right > br.right + 1.5 || tr.left < br.left - 1.5) && inkOutside(n, br)) {
        seen.add(box);
        if (!marked.has(box) && !underMarked(box)) mark(box, { kind: "text", sel: sel(box), text: n.data.trim().slice(0, 70), detail: `text ${Math.round(tr.left)}..${Math.round(tr.right)} in box ${Math.round(br.left)}..${Math.round(br.right)}` });
        break;
      }
    }
  }
  return { out, notes };
}

/* -------------------------------- what's checked with --align -------------------------------- */
/* Boxes in the main column that start further in on purpose (none today: mark one with data-indent). */
const INDENT_OK = "[data-indent]";

function align(INDENT_OK) {
  const W = window.innerWidth, H = window.innerHeight;
  const out = [];
  const CS = new Map(), SH = new Map();
  const css = el => { let v = CS.get(el); if (!v) { v = getComputedStyle(el); CS.set(el, v); } return v; };
  const R = el => el.getBoundingClientRect();
  const sel = el => {
    const part = e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + [...e.classList].slice(0, 3).map(c => "." + c).join("");
    const p = []; for (let e = el; e && e !== document.body && p.length < 5; e = e.parentElement) p.unshift(part(e));
    return p.join(" > ");
  };
  const label = el => (el.getAttribute("aria-label") || el.textContent || el.value || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const shown = el => { let v = SH.get(el); if (v === undefined) { v = shown_(el); SH.set(el, v); } return v; };
  const shown_ = el => {
    const cs = css(el);
    if (cs.display === "none" || cs.visibility !== "visible") return false;
    const r = R(el); if (r.width < 1 || r.height < 1) return false;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = a === el ? cs : css(a);
      if (+s.opacity === 0 || (s.clip && s.clip !== "auto")) return false;
      if (a.parentElement?.matches("details:not([open])") && !a.matches("summary")) return false;   // inside a closed fold
    }
    return true;
  };
  const onScreen = r => r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
  const seen = new Set();
  const mark = (el, kind, detail) => {
    const k = kind + "|" + sel(el); if (seen.has(k)) return; seen.add(k);
    el.setAttribute("data-al", out.length); out.push({ kind, sel: sel(el), text: label(el), detail });
  };
  const px = v => parseFloat(v) || 0;
  /** The content box, scrollbars left out. */
  const inner = el => {
    const r = R(el), s = css(el);
    const left = r.left + el.clientLeft + px(s.paddingLeft), top = r.top + el.clientTop + px(s.paddingTop);
    const w = el.clientWidth || r.width, h = el.clientHeight || r.height;
    return { left, top, right: r.left + el.clientLeft + w - px(s.paddingRight), bottom: r.top + el.clientTop + h - px(s.paddingBottom) };
  };
  const inFlow = el => { const p = css(el).position; return p !== "absolute" && p !== "fixed"; };
  const kids = el => {
    const k = [];
    for (const c of el.children) {
      if (c.matches("script, style, template")) continue;
      if (css(c).display === "contents") k.push(...kids(c));
      else if (shown(c)) k.push(c);
    }
    return k;
  };
  const f1 = n => Math.round(n * 10) / 10;
  const all = [...document.body.querySelectorAll("*")].filter(el => !(el.closest("svg") && el.tagName.toLowerCase() !== "svg"));

  /* The lines of text an element lays out itself (not in a block, flex or grid box inside it), each as its ink's left,
     right, top and bottom. Atomic inline boxes (an icon in the line) count as ink. */
  const lines = (box, deep) => {
    const got = [];
    const add = (r) => {
      if (r.width <= 0 || r.height <= 0) return;
      const l = got.find(g => Math.abs(g.top - r.top) < 3 || (r.top < g.bottom - 2 && r.bottom > g.top + 2));
      if (l) { l.left = Math.min(l.left, r.left); l.right = Math.max(l.right, r.right); l.top = Math.min(l.top, r.top); l.bottom = Math.max(l.bottom, r.bottom); }
      else got.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    };
    const walk = node => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) {
          const d = n.data; if (!d.trim()) continue;
          const rg = document.createRange();
          for (let i = 0; i < d.length; i++) {
            if (/\s/.test(d[i])) continue;
            rg.setStart(n, i); rg.setEnd(n, i + 1);
            for (const r of rg.getClientRects()) add(r);
          }
        } else if (n.nodeType === 1) {
          const s = css(n);
          if (s.display === "none" || !inFlow(n)) continue;
          if ((deep || s.display === "inline") && n.tagName.toLowerCase() !== "svg" && n.tagName.toLowerCase() !== "img" && !(deep && /^inline-(block|flex|grid)$/.test(s.display) && !n.textContent.trim())) walk(n);
          else if (/^inline/.test(s.display) || n.tagName.toLowerCase() === "svg" || n.tagName.toLowerCase() === "img") { if (s.display !== "contents") add(R(n)); }
        }
      }
    };
    walk(box);
    return got;
  };

  /* ---------------- dialogs ---------------- */
  const main = document.querySelector(".mainwrap");
  for (const el of document.querySelectorAll(".modal, .tour, .cmdk, .toast, .scrim:not(.right) > .sheet")) {
    if (!shown(el)) continue;
    const r = R(el);
    let host;
    if (el.matches(".toast")) { const c = document.querySelector(".content"); host = c ? (() => { const b = R(c); return { left: b.left + c.clientLeft, right: b.left + c.clientLeft + c.clientWidth, top: 0, bottom: H }; })() : { left: 0, right: W, top: 0, bottom: H }; }
    else { const b = R(el.parentElement); host = { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; }
    const gl = r.left - host.left, gr = host.right - r.right;
    if (Math.abs(gl - gr) > 2) mark(el, "dialog", `left gap ${f1(gl)}, right gap ${f1(gr)}`);
    if (el.matches(".modal, .tour, .scrim > .sheet")) {
      const gt = r.top - host.top, gb = host.bottom - r.bottom;
      if (Math.abs(gt - gb) > 2) mark(el, "dialog", `top gap ${f1(gt)}, bottom gap ${f1(gb)}`);
    }
  }

  /* ---------------- centered boxes and text ---------------- */
  for (const el of all) {
    if (!shown(el) || el.matches("input, textarea, select, option, svg")) continue;
    const s = css(el), d = s.display;
    const r = R(el); if (!onScreen(r)) continue;
    const flex = /flex/.test(d), grid = /grid/.test(d);
    const col = flex && s.flexDirection.startsWith("column");
    const centersKids = (col && s.alignItems === "center") || (grid && /center/.test(s.justifyItems));
    const rowCenter = flex && !col && s.justifyContent === "center";
    if (centersKids || rowCenter) {
      const box = inner(el), mid = (box.left + box.right) / 2, bw = box.right - box.left;
      const ks = kids(el).filter(inFlow);
      if (centersKids) for (const k of ks) {
        const ks_ = css(k);
        const self = grid ? ks_.justifySelf : ks_.alignSelf;
        if (!/^(auto|normal|center)$/.test(self)) continue;
        if (grid && s.gridTemplateColumns.split(" ").length > 1) continue;
        const kr = R(k); if (kr.width >= bw - 1) continue;
        const off = (kr.left + kr.right) / 2 - mid;
        if (Math.abs(off) > 2) mark(k, "center", `${f1(off)}px off the center of ${sel(el).split(" > ").pop()}`);
      }
      if (rowCenter && ks.length) {
        const rows = [];
        const items = ks.map(R);
        for (const n of el.childNodes) if (n.nodeType === 3 && n.data.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); items.push(...[...rg.getClientRects()].filter(x => x.width > 0)); }
        for (const kr of items) { const row = rows.find(x => kr.top < x.bottom - 1 && kr.bottom > x.top + 1); if (row) { row.left = Math.min(row.left, kr.left); row.right = Math.max(row.right, kr.right); row.top = Math.min(row.top, kr.top); row.bottom = Math.max(row.bottom, kr.bottom); } else rows.push({ top: kr.top, bottom: kr.bottom, left: kr.left, right: kr.right }); }
        for (const row of rows) { const off = (row.left + row.right) / 2 - mid; if (row.right - row.left < bw - 1 && Math.abs(off) > 2) mark(el, "center", `its row is ${f1(off)}px off center`); }
      }
    }
    if (s.textAlign === "center" && !flex && !grid && d !== "inline" && !el.matches("button")) {
      const box = inner(el), mid = (box.left + box.right) / 2;
      for (const ln of lines(el)) {
        const off = (ln.left + ln.right) / 2 - mid;
        if (ln.right - ln.left < box.right - box.left - 1 && Math.abs(off) > 2) { mark(el, "center", `a line of its text is ${f1(off)}px off center`); break; }
      }
    }
  }

  /* ---------------- icons beside text ---------------- */
  for (const svg of document.querySelectorAll("svg")) {
    if (!shown(svg)) continue;
    let ic = svg, r = R(svg);
    if (r.width > 28 || r.height > 28 || !onScreen(r)) continue;
    // the small box that holds only the icon (a tile, a round arrow, an icon button) stands for it
    while (ic.parentElement && ic.parentElement !== document.body) {
      const p = ic.parentElement, pr = R(p);
      const hasText = [...p.childNodes].some(n => n.nodeType === 3 && n.data.trim());
      if (hasText || kids(p).length !== 1 || pr.width > 44 || pr.height > 44 || !inFlow(ic)) break;
      ic = p;
    }
    if (!inFlow(ic)) continue;
    const row = ic.parentElement; if (!row) continue;
    const rs = css(row);
    { const g = css(ic); if (/grid/.test(rs.display) && g.gridRowEnd !== "auto" && g.gridRowEnd !== "span 1" && !(+g.gridRowEnd === +g.gridRowStart + 1)) continue; }
    const rowish = (/flex/.test(rs.display) && rs.flexDirection.startsWith("row")) || /grid/.test(rs.display);
    if (!rowish) continue;
    const ir = R(ic), icy = (ir.top + ir.bottom) / 2;
    // the text beside it: a text run of the row itself, or a sibling that holds text, nearest first
    const cands = [];
    for (const n of row.childNodes) {
      if (n === ic) continue;
      if (n.nodeType === 3 && n.data.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); const rs_ = [...rg.getClientRects()].filter(x => x.width > 0); if (rs_.length) cands.push({ node: n, ls: lines({ childNodes: [n] }, true), box: rs_[0] }); }
      else if (n.nodeType === 1 && shown(n) && inFlow(n) && n.textContent.trim() && !n.querySelector("input, textarea, select")) {
        const ls = lines(n, true); if (!ls.length) continue;
        cands.push({ node: n, ls, box: R(n) });
      }
    }
    const overl = c => Math.min(c.box.bottom, ir.bottom) - Math.max(c.box.top, ir.top) >= Math.min(c.box.height, ir.height) * .5;
    const near = cands.filter(overl).sort((a, b) => Math.min(Math.abs(a.box.left - ir.right), Math.abs(ir.left - a.box.right)) - Math.min(Math.abs(b.box.left - ir.right), Math.abs(ir.left - b.box.right)))[0];
    if (!near) continue;
    const ai = css(ic).alignSelf === "auto" ? rs.alignItems : css(ic).alignSelf;
    const top = /start|baseline|normal|stretch/.test(ai);
    if (near.ls.length > 1 && !top) continue;           // centered on a block of several lines: no single line to match
    const ln = near.ls.sort((a, b) => a.top - b.top)[0];
    if (near.ls.length > 1 && ir.height > (ln.bottom - ln.top) * 1.6) continue;   // a tile at the top of a block of lines
    // the line box: a one-line element's own content box when it is one line tall, else the line's glyphs
    let lc = (ln.top + ln.bottom) / 2;
    if (near.node.nodeType === 1) {
      let e = near.node;
      if (near.ls.length > 1) {
        const tw = document.createTreeWalker(near.node, NodeFilter.SHOW_TEXT, { acceptNode: n => n.data.trim() ? 1 : 2 });
        const t = tw.nextNode(); e = t?.parentElement;
        while (e && e !== near.node && css(e).display === "inline") e = e.parentElement;
      }
      if (e && lines(e, true).length === 1) {
        const b = inner(e), lh = px(css(e).lineHeight);
        if (lh && b.bottom - b.top <= lh + 1) lc = (b.top + b.bottom) / 2;
      }
    }
    const off = icy - lc;
    if (Math.abs(off) > 1.5) mark(ic, "icon", `${f1(off)}px ${off > 0 ? "below" : "above"} the center of "${(near.node.textContent || "").trim().slice(0, 30)}"`);
  }

  /* ---------------- the main column's left edge ---------------- */
  for (const page of document.querySelectorAll(".page")) {
    if (!shown(page)) continue;
    const cols = [page, ...page.querySelectorAll(":scope > .sec, :scope > section, :scope > div > .sec, .set-col, .set-col > .sg")];
    for (const c of cols) {
      if (!shown(c)) continue;
      const s = css(c);
      if (/grid/.test(s.display) && s.gridTemplateColumns.split(" ").length > 1) continue;
      if (/flex/.test(s.display) && !s.flexDirection.startsWith("column")) continue;
      if (s.textAlign === "center" || s.alignItems === "center") continue;
      const edge = inner(c).left, mid = (inner(c).left + inner(c).right) / 2;
      for (const k of kids(c).filter(inFlow)) {
        if (k.matches(INDENT_OK) || k.matches(".hero, .foot")) continue;
        const kr = R(k);
        if (Math.abs((kr.left + kr.right) / 2 - mid) <= 1 && kr.left > edge + 1) continue;   // centered on purpose
        if (Math.abs(kr.left - edge) > 1) mark(k, "column", `left edge ${f1(kr.left - edge)}px off its column (${sel(c).split(" > ").pop()})`);
      }
    }
  }

  /* ---------------- the chatbar ---------------- */
  const cw = document.querySelector(".dockbar .composer-wrap"), content = document.querySelector(".content");
  if (cw && content && shown(cw)) {
    const b = R(content), area = { left: b.left + content.clientLeft, right: b.left + content.clientLeft + content.clientWidth };
    const r = R(cw), gl = r.left - area.left, gr = area.right - r.right;
    if (Math.abs(gl - gr) > 2) mark(cw, "dock", `left gap ${f1(gl)}, right gap ${f1(gr)} in the content area`);
    const comp = cw.querySelector(".composer, .c-edge") || cw;
    const cm = (R(comp).left + R(comp).right) / 2;
    for (const k of kids(cw)) { if (k === comp || k.contains(comp)) continue; const kr = R(k); const off = (kr.left + kr.right) / 2 - cm; if (Math.abs(off) > 2) mark(k, "dock", `${f1(off)}px off the chatbar's center`); }
  }

  /* ---------------- overlap ---------------- */
  for (const el of all) {
    if (!shown(el) || el.matches("svg")) continue;
    const ks = kids(el); if (ks.length < 2) continue;
    const flow = ks.filter(inFlow);
    const boxes = flow.filter(k => css(k).display !== "inline" && css(k).position !== "sticky");
    for (let i = 0; i < boxes.length; i++) {
      const a = R(boxes[i]); if (!onScreen(a)) continue;
      for (let j = i + 1; j < boxes.length; j++) {
        const b = R(boxes[j]);
        const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left), oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ow > 1 && oh > 1) { mark(boxes[j], "overlap", `overlaps ${sel(boxes[i]).split(" > ").pop()} by ${f1(ow)}x${f1(oh)}`); break; }
      }
    }
    // a control placed over a sibling's text
    for (const a of ks.filter(k => css(k).position === "absolute")) {
      if (css(a).pointerEvents === "none") continue;
      const ar = R(a); if (!onScreen(ar)) continue;
      for (const t of flow) {
        let boxes;
        if (t.matches("input, textarea")) { const b = inner(t); boxes = [b]; }
        else boxes = lines(t).concat(...[...t.querySelectorAll("*")].filter(x => shown(x) && inFlow(x) && !/flex|grid|block/.test(css(x).display.replace("inline-", "x"))).map(lines));
        const hit = boxes.find(b => Math.min(ar.right, b.right) - Math.max(ar.left, b.left) > 1 && Math.min(ar.bottom, b.bottom) - Math.max(ar.top, b.top) > 1);
        if (hit) { mark(a, "overlap", `sits on the text of ${sel(t).split(" > ").pop()}`); break; }
      }
    }
  }
  // the chatbar over the end of the page, scrolled to the bottom (a sheet or modal over the page stands above the chatbar)
  if (cw && content && shown(cw) && content.scrollHeight > content.clientHeight + 2) {
    const was = content.scrollTop;
    content.scrollTop = content.scrollHeight;
    const top = Math.min(...kids(cw).map(k => R(k).top));
    let last = null, lb = -1;
    for (const e of content.querySelectorAll("*")) {
      if (e.closest(".dockbar, [aria-modal=true]") || !shown(e) || !inFlow(e) || e.closest("svg")) continue;
      const leaf = !e.children.length || [...e.childNodes].some(n => n.nodeType === 3 && n.data.trim()) || e.matches("img, canvas, input, textarea, select, button, .tray, .card, .store, .file, .sg, .pb, .job");
      if (!leaf || (!e.textContent.trim() && !e.matches("img, canvas, input, textarea, select")) || e.matches(".page")) continue;
      const b = R(e).bottom; if (b > lb) { lb = b; last = e; }
    }
    if (last && lb > top + 1) mark(last, "overlap", `the chatbar covers it at the end of the page: bottom ${f1(lb)}, chatbar top ${f1(top)}`);
    content.scrollTop = was;
  }

  /* ---------------- dropdowns ---------------- */
  const probe = st => { const d = document.createElement("div"); Object.assign(d.style, st, { position: "absolute", visibility: "hidden" }); document.body.appendChild(d); const v = getComputedStyle(d); const o = { boxShadow: v.boxShadow, background: v.backgroundColor }; d.remove(); return o; };
  const RING = probe({ boxShadow: "0 0 0 1px rgba(var(--e), .1)" }).boxShadow;
  const LIFT = probe({ boxShadow: "var(--lift)" }).boxShadow;
  const CARD = probe({ backgroundColor: "var(--card)" }).background;
  const MIST = probe({ backgroundColor: "var(--mist)" }).background;
  const FONT = { 34: "13.5px", 38: "14px", 46: "15px" };
  for (const el of document.querySelectorAll("select, [aria-haspopup=listbox]")) {
    if (!shown(el)) continue;
    const s = css(el), r = R(el), h = Math.round(r.height), bad = [];
    if (!(h in FONT)) bad.push(`height ${f1(r.height)}`);
    else if (s.fontSize !== FONT[h]) bad.push(`font ${s.fontSize} (want ${FONT[h]})`);
    if (s.borderTopLeftRadius !== "12px") bad.push(`radius ${s.borderTopLeftRadius}`);
    if (px(s.borderTopWidth) !== 0) bad.push(`border ${s.borderTopWidth} ${s.borderTopColor}`);
    if (el !== document.activeElement && !el.matches(":hover") && s.boxShadow !== RING) bad.push(`ring ${s.boxShadow}`);
    if (!el.disabled && s.backgroundColor !== CARD) bad.push(`background ${s.backgroundColor}`);
    if (px(s.paddingRight) !== 34) bad.push(`padding-right ${s.paddingRight}`);
    if (!/^url\("data:image\/svg/.test(s.backgroundImage)) bad.push("no shared chevron");
    if (el.tagName === "SELECT" && s.appearance !== "none") bad.push(`appearance ${s.appearance}`);
    if (bad.length) mark(el, "dropdown", bad.join(", "));
  }
  for (const m of document.querySelectorAll("[role=menu], [role=listbox]")) {
    if (!shown(m) || m.closest(".cmdk, .modal")) continue;
    const s = css(m), r = R(m), bad = [];
    if (s.borderTopLeftRadius !== "16px") bad.push(`radius ${s.borderTopLeftRadius}`);
    if (s.paddingTop !== "6px" || s.paddingLeft !== "6px") bad.push(`padding ${s.paddingTop} ${s.paddingLeft}`);
    if (s.boxShadow !== LIFT) bad.push("shadow isn't the menu's");
    if (r.left < 0 || r.top < 0 || r.right > W || r.bottom > H) bad.push(`off screen ${f1(r.left)},${f1(r.top)} ${f1(r.right)},${f1(r.bottom)}`);
    const items = [...m.querySelectorAll("[role^=menuitem], [role=option]")].map(i => i.matches("li") && i.firstElementChild ? i.firstElementChild : i).filter(shown);
    for (const i of items) { const ih = R(i).height; if (Math.round(ih) !== 38) { bad.push(`item height ${f1(ih)}`); break; } }
    for (const i of items) { if (css(i).borderTopLeftRadius !== "10px") { bad.push(`item radius ${css(i).borderTopLeftRadius}`); break; } }
    // every item's label starts at the same x, with or without an icon
    const starts = items.map(i => { const t = document.createTreeWalker(i, NodeFilter.SHOW_TEXT, { acceptNode: n => n.data.trim() ? 1 : 2 }).nextNode(); if (!t) return null; const rg = document.createRange(); rg.setStart(t, t.data.search(/\S/)); rg.setEnd(t, t.data.search(/\S/) + 1); return rg.getBoundingClientRect().left; }).filter(x => x !== null);
    if (starts.length > 1 && Math.max(...starts) - Math.min(...starts) > 1) bad.push(`item labels start at ${[...new Set(starts.map(Math.round))].join(", ")}`);
    const pickd = m.querySelector("[aria-selected=true], [aria-checked=true], [aria-current=true]");
    if (pickd && !pickd.querySelector("svg.menu-check")) bad.push("the picked item has no check");
    if (bad.length) mark(m, "dropdown", bad.join(", "));
  }
  // the lists inside ⌘K and the language picker: the same items, the same highlight
  for (const i of document.querySelectorAll(".cmdk-list [role=option].on, .langpick [role=option][aria-selected=true]")) {
    if (!shown(i)) continue;
    const s = css(i), bad = [];
    if (s.borderTopLeftRadius !== "10px") bad.push(`radius ${s.borderTopLeftRadius}`);
    if (s.backgroundColor !== MIST) bad.push(`highlight ${s.backgroundColor}`);
    if (bad.length) mark(i, "dropdown", bad.join(", "));
  }
  return out;
}

/* -------------------------------- getting around -------------------------------- */
const settle = p => p.waitForTimeout(450);
const tourOff = async p => { const s = p.locator(".tour-skip"); if (await s.count() && await s.first().isVisible()) { await s.first().click(); await settle(p); } };
const open = async (p, path) => { await p.goto(URL_ + path); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(700); await tourOff(p); };
const onScreen = async l => { const b = await l.boundingBox().catch(() => null); return !!b && b.x + b.width > 0 && b.x < p0w(l); };
const p0w = l => l.page().viewportSize().width;
const click = async (p, loc) => {
  const l = p.locator(loc).filter({ visible: true }).first();
  if (!(await l.count()) || !(await onScreen(l))) return false;   // a closed phone menu is "visible" but off to the side
  await l.click(); await settle(p); return true;
};
const clickText = async (p, text) => { const l = p.getByRole("button", { name: text }).filter({ visible: true }).first(); if (!(await l.count())) return false; await l.click(); await settle(p); return true; };

/** Clicks a sidebar control, opening the phone menu first when the sidebar is tucked away. */
const viaMenu = async (p, loc) => (await click(p, loc)) || ((await click(p, ".mbar button[aria-label=Menu]")) && click(p, loc));

async function signIn(p) {
  await p.goto(URL_); await p.waitForTimeout(1200);
  if (await p.locator("#gate-email").count()) {
    await p.fill("#gate-email", "fit@example.com"); await p.click("button[type=submit]"); await p.waitForTimeout(700);
    await p.getByText("Email me a code instead").click(); await p.waitForTimeout(700);
    await p.fill("#gate-code", "123456"); await p.click("button[type=submit]"); await p.waitForTimeout(2500);
  }
  if (await p.locator("#onb-line").count()) {
    await p.fill("#onb-line", "Milk tea shop in San Jose, CA"); await p.locator("#onb-agree").check();
    await p.click("button[type=submit]"); await p.waitForTimeout(700);
    // the second screen: the three optional answers that fill the first application (src/plan/prefill.ts)
    if (await p.locator("#onb-legal").count()) {
      await p.fill("#onb-legal", "Lucky Leaf Tea LLC"); await p.fill("#onb-owner", "Mei Chen"); await p.fill("#onb-address", "1 N First St, San Jose, CA 95113");
      await p.click("button[type=submit]");
    }
    await p.waitForTimeout(3500);
  }
}

/* Four places plus Settings (src/route.ts): Home, Permits with its tabs, Stores, Odelia with its tabs. The old
   addresses (/work, /applications, /context and the rest) are checked too: each opens its new home. */
const SETTINGS = ["general", "facts", "team", "odelia", "connections", "billing", "security", "privacy", "activity", "help"];
const PAGES = [["home", ""], ["permits", "permits"], ["permits-filed", "permits/filed"], ["permits-review", "permits/review"], ["permits-documents", "permits/documents"], ["permits-deadlines", "permits/deadlines"],
  ["find", "permits/find"], ["stores", "stores"], ["odelia-chat", "odelia"], ["odelia-work", "odelia/work"], ["odelia-playbooks", "odelia/playbooks"], ["odelia-updates", "odelia/updates"],
  ["headquarters", "headquarters"], ["partner", "partner"],
  ["old-work", "work"], ["old-applications", "applications"], ["old-documents", "documents"], ["old-deadlines", "deadlines"], ["old-activity", "activity"], ["old-context", "context"], ["old-find", "find"]];

/** Every state checked: a name and how to get there. A state whose opener finds nothing to click is skipped. */
const DARK = new Set(["settings-general", "settings-team", "settings-odelia", "settings-billing-budgets", "plans", "ws-menu", "settings-lark-bot"]);
const STATES = [
  ...PAGES.map(([n, path]) => ({ name: n, go: p => open(p, path) })),
  ...SETTINGS.map(c => ({ name: "settings-" + c, go: p => open(p, "settings/" + c) })),
  { name: "settings-lark-bot", go: async p => {
    await open(p, "settings/connections");
    const b = p.locator(".sg-row", { hasText: /Odelia in Lark/ }).getByRole("button", { name: "Set up" });
    if (!(await b.count())) return false;
    await b.first().click(); await settle(p);
    return (await p.locator(".sg-bot select").count()) > 0;
  } },
  { name: "ws-menu", go: async p => { await open(p, ""); const w = p.locator("button.wsname:not(:disabled)"); if (!(await w.count())) return false; return viaMenu(p, "button.wsname"); } },
  { name: "settings-billing-budgets", go: async p => {
    await open(p, "settings/billing");
    await clickText(p, "Let Odelia suggest from the opening plan"); await clickText(p, "Add a budget");
    await p.locator(".spend-b").first().scrollIntoViewIfNeeded().catch(() => {});
    return true;
  } },
  { name: "find-results", go: async p => { await open(p, "permits/find"); if (!(await clickText(p, "Milk tea shop, San Jose, CA"))) return false; await p.locator(".hit").first().waitFor({ timeout: 20000 }).catch(() => {}); await p.waitForTimeout(800); return true; } },
  { name: "nav-menu", go: async p => { await open(p, ""); return click(p, ".mbar button[aria-label=Menu]"); } },
  // the sidebar's More group opened by hand on Home (it opens by itself on the pages it lists); the phone menu lists them outright
  { name: "nav-more", go: async p => {
    await p.evaluate(() => { try { localStorage.removeItem("placetta-side-more"); } catch { /* blocked */ } }).catch(() => {});
    await open(p, ""); return click(p, ".moreb[aria-expanded=false]");
  } },
  // the chat beside the work: ask from the dock on Home, the panel opens (docked on a desktop, a sheet on a phone)
  { name: "odelia-panel", go: async p => { await open(p, "stores"); const box = p.locator(".dockbar textarea").filter({ visible: true }).first(); if (!(await box.count())) return false; await box.fill("What's due this week?"); await box.press("Enter"); await p.waitForTimeout(1500); return true; } },
  { name: "odelia-chat-typed", go: async p => {
    await open(p, "odelia");
    const box = p.locator(".panel textarea").filter({ visible: true }).first();
    if (await box.count()) { await box.fill("What do I need for https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/permit-center-applications-and-forms"); await box.press("Enter"); await p.waitForTimeout(2500); }
    return true;
  } },
  { name: "cmdk", go: async p => { await open(p, ""); if (await viaMenu(p, ".cmdk-open")) return true; await p.keyboard.press("Control+k"); await settle(p); return true; } },
  { name: "cmdk-typed", go: async p => { await open(p, ""); if (!(await viaMenu(p, ".cmdk-open"))) { await p.keyboard.press("Control+k"); await settle(p); } await p.keyboard.type("food facility plan check permit"); await settle(p); return true; } },
  { name: "approval-drawer", go: async p => { await open(p, ""); return clickText(p, "Approve"); } },
  { name: "tabbar-odelia", go: async p => { await open(p, ""); return click(p, ".tabbar a:last-child"); } },
  { name: "plans", go: async p => {
    await open(p, "");
    for (const t of [/^Get your entry plan/, /^See plans/, /^Change plan/, /^Compare plans/]) if (await clickText(p, t)) return true;
    await open(p, "settings/billing");
    for (const t of [/^(See|View|Compare|Change|Choose a) plans?$/i, /^Upgrade/]) if (await clickText(p, t)) return true;
    return false;
  } },
  { name: "playbooks-open", go: async p => { await open(p, "odelia/playbooks"); return click(p, ".pb-tog"); } },
  { name: "work-open", go: async p => { await open(p, "odelia/work"); const a = await click(p, ".hz-tog"); const b = await click(p, ".sec-h.tog"); return a || b; } },
  { name: "store-detail", go: async p => { await open(p, "stores"); return click(p, "button.store"); } },
  { name: "store-detail-2", go: async p => { await open(p, "stores"); const l = p.locator("button.store").filter({ visible: true }); if (await l.count() < 2) return false; await l.nth(1).click(); await settle(p); return true; } },
  { name: "stores-plan-many", go: async p => { await open(p, "stores"); await p.locator(".st-more .pill").first().click().catch(() => {}); return clickText(p, "Plan many stores"); } },
  /* Team review: cells picked in the review table, each bulk action open, a cell opened by headquarters, and a
     document's comments */
  { name: "review-picked", go: async p => { await open(p, "permits/review"); const l = p.locator(".rv-pick").filter({ visible: true }); if (!(await l.count())) return false; await l.first().check(); await settle(p); return true; } },
  { name: "review-remind", go: async p => { await open(p, "permits/review"); const l = p.locator(".rv-pick").filter({ visible: true }); if (!(await l.count())) return false; await l.first().check(); await settle(p); return clickText(p, "Set a reminder"); } },
  { name: "review-filters", go: async p => { await open(p, "permits/review"); if (await click(p, ".rv-ftog")) return true; return (await p.locator(".rv-filters").count()) > 0; } },
  { name: "hq-picked-ask", go: async p => { await open(p, "headquarters"); const l = p.locator(".rv-pick").filter({ visible: true }); if (!(await l.count())) return false; await l.first().check(); await settle(p); return clickText(p, "Ask the franchisee"); } },
  { name: "hq-item", go: async p => { await open(p, "headquarters"); return click(p, ".rv-c.s-missing .rv-open, .rv-open"); } },
  { name: "doc-comments", go: async p => { await open(p, "permits/documents"); return click(p, ".cmt-btn.has, .cmt-btn"); } },
  { name: "stores-check", go: async p => { await open(p, "stores"); await p.locator(".st-more .pill").first().click().catch(() => {}); return clickText(p, "Check stores already open"); } },
  { name: "stores-check-list", go: async p => { await open(p, "stores"); await p.locator(".st-more .pill").first().click().catch(() => {}); if (!(await clickText(p, "Check stores already open"))) return false; await p.locator(".sc-f input").first().fill("Flushing, NY"); return clickText(p, "Check my stores"); } },
  { name: "stores-check-gaps", go: async p => { await open(p, "stores"); await p.locator(".st-more .pill").first().click().catch(() => {}); if (!(await clickText(p, "Check stores already open"))) return false; await p.locator(".sc-f input").first().fill("Irvine, CA"); if (!(await clickText(p, "Check my stores"))) return false; return clickText(p, "Show my gaps"); } },
  { name: "app-drawer", tabs: true, go: async p => { await open(p, "permits"); return click(p, ".apps-t .tr.row, button.row.arow"); } },
  { name: "app-drawer-crit", tabs: true, go: async p => { await open(p, "permits"); return click(p, ".apps-t .tr.row.crit, button.row.arow.crit"); } },
  ...[0, 1, 2].map(step => ({ name: "tour" + (step ? "-step" + (step + 1) : ""), go: async p => {
    await p.evaluate(() => { try { for (const k of Object.keys(localStorage)) if (/tour/i.test(k)) localStorage.removeItem(k); } catch { /* blocked */ } });
    await p.goto(URL_); await p.waitForTimeout(1200);
    if (!(await p.locator(".tour-skip").count())) return false;
    for (let i = 0; i < step; i++) if (!(await click(p, ".tour .sbtn.ink"))) return false;
    await p.waitForTimeout(1200);
    return true;
  } })),
];

/* -------------------------------- run -------------------------------- */
mkdirSync(OUT, { recursive: true });
// --scrollbars: classic scrollbars, as on Windows and Linux (headless hides them), to see the chatbar and toasts stay
// centered over the column and not the column plus its scrollbar
const browser = await chromium.launch(flag("scrollbars") ? { ignoreDefaultArgs: ["--hide-scrollbars"] } : {});
// A plain static server (python3 -m http.server) has no fallback to index.html for /app/stores and the like: give
// every page address under /app/ the app's index.html, as the real host does.
const spa = ctx => ctx.route(u => u.href.startsWith(URL_), async route => {
  if (route.request().resourceType() !== "document") return route.continue();
  try { return await route.fulfill({ response: await route.fetch({ url: URL_ }) }); }
  catch (e) { console.error(`  can't load ${URL_}: ${e.message.split("\n")[0]}`); return route.abort().catch(() => {}); }
});
let storage;
if (SIGNIN) {
  const c = await browser.newContext({ viewport: { width: 1280, height: HEIGHT } });
  await spa(c);
  const p = await c.newPage(); await signIn(p);
  storage = await c.storageState(); await c.close();
}

const findings = [], scrolls = [];
const summary = {};
const byKind = {};
async function record(p, W, name) {
  const ATTR = ALIGN ? "data-al" : "data-fit";
  await p.evaluate(a => document.querySelectorAll(`[${a}]`).forEach(e => e.removeAttribute(a)), ATTR);
  const { out: found, notes } = ALIGN ? { out: await p.evaluate(align, INDENT_OK), notes: [] } : await p.evaluate(check, SIDEWAYS_OK);
  for (const f of found) { const k = (byKind[f.kind] ??= {}); k[W] = (k[W] ?? 0) + 1; }
  for (const n of notes) scrolls.push({ page: name, width: W, ...n });
  summary[`${name}@${W}`] = found.length;
  for (const f of found) findings.push({ page: name, width: W, ...f });
  console.log(`${found.length ? "FAIL" : " ok "} ${String(W).padStart(4)} ${name}${found.length ? `: ${found.length}` : ""}`);
  for (const f of found) console.log(`       ${f.kind.padEnd(9)} ${f.sel}  "${f.text ?? ""}"  ${f.detail}`);
  if (found.length || SHOTS_ALL) {
    await p.addStyleTag({ content: `[${ATTR}]{outline:2px solid #e0245e !important;outline-offset:-1px}` });
    await p.evaluate(a => { const e = document.querySelector(`[${a}]`); if (e && e.tagName !== "HTML" && !e.closest(".toast, .tour, .modal, .cmdk, [role=menu], [role=listbox]")) e.scrollIntoView({ block: "center", inline: "nearest" }); }, ATTR);
    await p.screenshot({ path: join(OUT, `${W}-${name}.png`) });
  }
}

/** Signed out (with --signin): the sign-in screens and onboarding, step by step, in a fresh browser. */
async function gate(W) {
  const ctx = await browser.newContext({ viewport: { width: W, height: HEIGHT }, reducedMotion: "reduce" });
  await spa(ctx);
  const p = await ctx.newPage(); p.setDefaultTimeout(6000);
  const steps = [
    ["gate-email", async () => { await p.goto(URL_); await p.waitForTimeout(1200); return (await p.locator("#gate-email").count()) > 0; }],
    ...(ALIGN ? [
      ["gate-region", async () => { const r = p.locator(".region [aria-haspopup=listbox]"); if (!(await r.count())) return true; await r.first().click(); await settle(p); return true; }],
      ["gate-phone", async () => { await p.keyboard.press("Escape"); await settle(p); const b = p.locator(".gate-phone"); if (!(await b.count())) return true; await b.click(); await settle(p); return true; }],
      ["gate-email-again", async () => { const b = p.getByRole("button", { name: "Use email instead" }); if (await b.count()) { await b.click(); await settle(p); } return (await p.locator("#gate-email").count()) > 0; }],
    ] : []),
    ["gate-password", async () => { await p.fill("#gate-email", `fit-${W}@example.com`); await p.click("button[type=submit]"); await p.waitForTimeout(700); return (await p.locator("#gate-pw").count()) > 0; }],
    ["gate-code", async () => { await p.getByText("Email me a code instead").click(); await p.waitForTimeout(700); return (await p.locator("#gate-code").count()) > 0; }],
    ["onboarding", async () => { await p.fill("#gate-code", "123456"); await p.click("button[type=submit]"); await p.waitForTimeout(2500); return (await p.locator("#onb-line").count()) > 0; }],
    ["onboarding-filled", async () => { await p.fill("#onb-line", "Bubble tea and hot pot restaurant with a retail counter in Rowland Heights, Los Angeles County, CA"); await p.waitForTimeout(600); const more = p.getByRole("button", { name: /Add a name/ }); if (await more.count()) { await more.first().click(); await settle(p); } return true; }],
    ["onboarding-answers", async () => { if (await p.locator("#onb-place").count()) await p.fill("#onb-place", "Rowland Heights, CA"); await p.locator("#onb-agree").check(); await p.click("form.onb button[type=submit]"); await p.waitForTimeout(600); if (!(await p.locator("#onb-legal").count())) return false; await p.fill("#onb-legal", "Lucky Leaf Tea LLC"); await p.fill("#onb-owner", "Mei Chen"); await p.fill("#onb-address", "18800 Colima Rd, Rowland Heights, CA 91748"); await settle(p); return true; }],
  ];
  for (const [name, go] of steps) {
    if (ONLY && !name.includes(ONLY)) { if (!(await go().catch(() => false))) break; continue; }
    if (!(await go().catch(e => { console.error(`  [${W}] ${name}: ${e.message.split("\n")[0]}`); return false; }))) { console.log(`  [${W}] ${name}: not reached, stopped`); break; }
    await record(p, W, name);
  }
  await ctx.close();
}

for (const W of WIDTHS) {
  if (SIGNIN) await gate(W);
  const ctx = await browser.newContext({ viewport: { width: W, height: HEIGHT }, reducedMotion: "reduce", ...(storage ? { storageState: storage } : {}) });
  await spa(ctx);
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  p.on("pageerror", e => console.error(`  [${W}] page error: ${e.message}`));
  for (const st of STATES) {
    if (ONLY && !st.name.includes(ONLY)) continue;
    const ok = await st.go(p).catch(e => { console.error(`  [${W}] ${st.name}: ${e.message.split("\n")[0]}`); return false; });
    if (ok === false) { console.log(`  [${W}] ${st.name}: nothing to open, skipped`); continue; }
    const variants = [{ name: st.name }];
    if (st.tabs) {
      const tabs = p.locator("[role=dialog] [role=tab], .sheet [role=tab]").filter({ visible: true });
      const n = await tabs.count();
      for (let i = 1; i < n; i++) variants.push({ name: `${st.name}-tab${i + 1}`, tab: i });
    }
    if (ALIGN && DARK.has(st.name)) variants.push({ name: st.name + "-dark", dark: true });
    for (const v of variants) {
      if (v.dark) { await p.evaluate(() => { document.documentElement.dataset.theme = "dark"; }); await p.waitForTimeout(150); }
      if (v.tab !== undefined) { await p.locator("[role=dialog] [role=tab], .sheet [role=tab]").filter({ visible: true }).nth(v.tab).click().catch(() => {}); await settle(p); }
      await record(p, W, v.name);
    }
  }
  await ctx.close();
}
await browser.close();

const total = findings.length;
writeFileSync(join(OUT, "findings.json"), JSON.stringify({ url: URL_, widths: WIDTHS, total, summary, findings, byKind, sidewaysStrips: scrolls }, null, 2));
const strips = [...new Set(scrolls.map(n => `${n.width} ${n.page}: ${n.sel.split(" > ").pop()}`))];
if (strips.length) console.log(`\nStrips that scroll sideways on purpose (not counted):\n  ${strips.join("\n  ")}`);
if (ALIGN) {
  console.log("\nBy check and width:");
  console.log("  " + "check".padEnd(10) + WIDTHS.map(w => String(w).padStart(6)).join("") + "   total");
  for (const [k, v] of Object.entries(byKind)) console.log("  " + k.padEnd(10) + WIDTHS.map(w => String(v[w] ?? 0).padStart(6)).join("") + String(Object.values(v).reduce((a, b) => a + b, 0)).padStart(8));
}
console.log(`\n${total} offender${total === 1 ? "" : "s"} across ${Object.keys(summary).length} page states. Findings: ${join(OUT, "findings.json")}`);
process.exit(total ? 1 : 0);
