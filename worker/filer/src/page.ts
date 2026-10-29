// Reading a page into a compact state, and turning the worker's stable selectors back into Playwright locators.
//
// Selectors: "label:<text>" (getByLabel, exact), "button:<text>", "link:<text>", or a CSS selector built from
// id or name ("#id", "[name=\"x\"]"). Labels first, so a recorded step survives cosmetic changes to the page.
import type { Locator, Page } from "playwright-core";
import { secretControl, STAFF_HIDDEN_AUTOCOMPLETE, STAFF_HIDDEN_SOURCE, type PageState } from "./guards.ts";

/** The page as the model sees it. A page that starts a navigation while it's read (a refused jump to another site
 *  included) is read again once it settles. */
export async function pageState(page: Page): Promise<PageState> {
  for (let i = 0; ; i++) {
    try { return await readState(page); }
    catch (e) {
      if (i >= 3 || !/context was destroyed|navigat/i.test(String((e as Error)?.message ?? e))) throw e;
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await page.waitForTimeout(150);
    }
  }
}

async function readState(page: Page): Promise<PageState> {
  const s = await page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const st = getComputedStyle(el as HTMLElement);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
    };
    const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
    const labelOf = (el: HTMLElement): string => {
      const id = el.getAttribute("id");
      if (id) { const l = document.querySelector(`label[for="${CSS.escape(id)}"]`); if (l) return clean(l.textContent); }
      const wrap = el.closest("label"); if (wrap) return clean(wrap.textContent);
      const aria = el.getAttribute("aria-label"); if (aria) return clean(aria);
      const by = el.getAttribute("aria-labelledby"); if (by) return clean(by.split(/\s+/).map((x) => document.getElementById(x)?.textContent ?? "").join(" "));
      return clean(el.getAttribute("placeholder"));
    };
    const labels = new Map<string, number>();
    const controls: unknown[] = [];
    for (const el of Array.from(document.querySelectorAll("input, select, textarea")) as HTMLInputElement[]) {
      const type = (el.getAttribute("type") ?? (el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : "text")).toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(type)) continue;
      // a checkbox or radio a site hides and draws on its label (USWDS, FinCEN, SF, Georgia's GenTax) counts when its label shows
      const drawnOnLabel = (type === "checkbox" || type === "radio") && (() => {
        const id = el.getAttribute("id");
        const l = (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null) ?? el.closest("label");
        return !!l && visible(l);
      })();
      if (!visible(el) && type !== "file" && !drawnOnLabel) continue;
      const label = labelOf(el);
      labels.set(label, (labels.get(label) ?? 0) + 1);
      controls.push({
        tag: el.tagName.toLowerCase(), type, label, name: el.getAttribute("name") ?? "", id: el.getAttribute("id") ?? "",
        autocomplete: (el.getAttribute("autocomplete") ?? "").toLowerCase(),
        value: type === "password" ? (el.value ? "(filled)" : "") : type === "file" ? "" : String(el.value ?? "").slice(0, 200),
        options: el.tagName === "SELECT" ? Array.from((el as unknown as HTMLSelectElement).options).map((o) => clean(o.textContent)).slice(0, 60) : undefined,
        checked: type === "checkbox" || type === "radio" ? el.checked : undefined,
      });
    }
    const buttons = (Array.from(document.querySelectorAll("button, input[type=submit], input[type=button], [role=button]")) as HTMLElement[])
      .filter(visible).map((b) => clean(b.textContent || (b as HTMLInputElement).value || b.getAttribute("aria-label"))).filter(Boolean);
    const links = (Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[]).filter(visible)
      .map((a) => ({ text: clean(a.textContent), href: a.href })).filter((a) => a.text).slice(0, 40);
    const frames = Array.from(document.querySelectorAll("iframe")).map((f) => f.getAttribute("src") ?? "");
    const markers = Array.from(document.querySelectorAll("[class*=captcha], [id*=captcha], .g-recaptcha, .h-captcha, .cf-turnstile"))
      .map((e) => `${e.className} ${e.id}`);
    return {
      url: location.href, title: document.title,
      headings: (Array.from(document.querySelectorAll("h1, h2, h3")) as HTMLElement[]).filter(visible).map((h) => clean(h.textContent)).slice(0, 12),
      controls, labels: Array.from(labels.entries()), buttons, links, frames, markers,
      ...readable(),
    };
    /** The text a person sees, and what's hidden from them: tiny, transparent, the colour of its background, off-screen. */
    function readable() {
      const shown: string[] = [], hidden: string[] = [];
      const bgOf = (el: Element | null): string => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; } return "rgb(255, 255, 255)"; };
      const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = clean(n.textContent); const el = n.parentElement;
        if (!t || !el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
        const st = getComputedStyle(el), r = el.getBoundingClientRect();
        if (st.display === "none" || st.visibility === "hidden" || !el.getClientRects().length) continue;   // innerText leaves these out too
        const tiny = parseFloat(st.fontSize) < 4, faint = parseFloat(st.opacity) < 0.05 || /rgba\([^)]*, 0\)$/.test(st.color);
        const same = st.color === bgOf(el), off = r.right < 0 || r.bottom < 0 || r.width < 2 || r.height < 2;
        (tiny || faint || same || off ? hidden : shown).push(t);
      }
      return { text: shown.join("\n").slice(0, 6000), hidden: hidden.join(" ").slice(0, 2000) ? [hidden.join(" ").slice(0, 2000)] : [] };
    }
  });
  const dup = new Map(s.labels as [string, number][]);
  const controls = (s.controls as Omit<PageState["controls"][number], "selector">[]).map((c) => ({
    ...c,
    // what a person typed on an SSN, card, bank or code line is never read back: the model and the logs see only that
    // the line has something in it
    value: c.value && secretControl(c) ? "(filled)" : c.value,
    selector: c.label && dup.get(c.label) === 1 && c.type !== "radio" ? `label:${c.label}` : c.id ? `#${c.id}` : c.name ? `[name="${c.name}"]` : `label:${c.label}`,
  }));
  return {
    url: s.url, title: s.title, headings: s.headings, controls,
    buttons: s.buttons.map((t: string) => ({ selector: `button:${t}`, text: t })),
    links: s.links.map((l: { text: string; href: string }) => ({ selector: `link:${l.text}`, text: l.text, href: l.href })),
    text: s.text, frames: s.frames, markers: s.markers, hidden: s.hidden,
  };
}

/** A person has answered the page's CAPTCHA: the widget's own response field has its token. Read only, never written:
 *  Placetta never solves a CAPTCHA, it only sees that the person did. */
export async function captchaAnswered(page: Page): Promise<boolean> {
  return await page.evaluate(() => Array.from(document.querySelectorAll('[name^="g-recaptcha-response"], [name="h-captcha-response"], [name="cf-turnstile-response"]'))
    .some((e) => !!(e as HTMLInputElement).value)).catch(() => false);
}

/** Marks every line the team's live view covers (guards.ts staffHides, the same rule run in the page). A mark stays put,
 *  so a password line a person switches to plain text stays covered. */
const HIDDEN_ATTR = "data-placetta-hidden";
export async function tagHidden(page: Page): Promise<void> {
  await page.evaluate(([src, attr, acs]) => {
    const re = new RegExp(src, "i");
    for (const el of Array.from(document.querySelectorAll("input, select, textarea")) as HTMLInputElement[]) {
      if (el.hasAttribute(attr)) continue;
      const type = (el.getAttribute("type") ?? "").toLowerCase(), ac = (el.getAttribute("autocomplete") ?? "").toLowerCase();
      const id = el.getAttribute("id");
      const label = [id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : "", el.closest("label")?.textContent, el.getAttribute("aria-label")].filter(Boolean).join(" ");
      const said = `${label} ${el.getAttribute("name") ?? ""} ${id ?? ""} ${el.getAttribute("placeholder") ?? ""}`.replace(/[_-]+/g, " ");
      if (type === "password" || /^cc-/.test(ac) || (acs as readonly string[]).includes(ac) || re.test(said)) el.setAttribute(attr, "1");
    }
  }, [STAFF_HIDDEN_SOURCE, HIDDEN_ATTR, STAFF_HIDDEN_AUTOCOMPLETE] as const);
}

/** The team's live view of a page (live.ts StaffGuard): a picture with every owner's line covered, and whether the line
 *  in focus is one of them (staff can't type there). Fails closed: if the page can't be marked, no picture. */
export function staffGuard(page: Page) {
  return {
    async shot(): Promise<Uint8Array> {
      await tagHidden(page);
      return await page.screenshot({ type: "jpeg", quality: 70, mask: [page.locator(`[${HIDDEN_ATTR}]`)], maskColor: "#3a3936" });
    },
    async typingBlocked(): Promise<boolean> {
      try {
        await tagHidden(page);
        return await page.evaluate((attr) => !!document.activeElement?.closest(`[${attr}]`), HIDDEN_ATTR);
      } catch { return true; }
    },
  };
}

/** The selector as a Playwright locator. */
/** Tick or untick a checkbox or radio. Many government sites (USWDS, FinCEN's BOI e-filing) hide the real input and draw
 *  their own box on its label, so Playwright's setChecked waits on an input nobody can see. Try it briefly, then click
 *  the input's label, then set it directly; each counts only when the input really ends up in that state. */
export async function tick(loc: Locator, on: boolean): Promise<void> {
  const ok = async () => (await loc.isChecked({ timeout: 2000 }).catch(() => !on)) === on;
  try { await loc.setChecked(on, { timeout: 5000 }); if (await ok()) return; } catch { /* hidden input: try its label */ }
  const id = await loc.getAttribute("id", { timeout: 2000 }).catch(() => null);
  if (id) {
    const label = loc.page().locator(`label[for="${id.replace(/["\\]/g, "\\$&")}"]`).first();
    if (await label.count().catch(() => 0)) {
      if (on || (await loc.getAttribute("type").catch(() => "")) !== "radio") await label.click({ timeout: 5000 }).catch(() => {});
      if (await ok()) return;
    }
  }
  await loc.setChecked(on, { force: true, timeout: 5000 }).catch(() => {});
  if (await ok()) return;
  throw new Error(`Couldn't ${on ? "tick" : "untick"} that box on the page.`);
}

export function locate(page: Page, selector: string): Locator {
  if (selector.startsWith("label:")) return page.getByLabel(selector.slice(6), { exact: true });
  // by its accessible name, or (Georgia's GenTax hides its step buttons from the accessibility tree) by its own text
  if (selector.startsWith("button:")) {
    const name = selector.slice(7), exact = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
    return page.getByRole("button", { name, exact: true }).or(page.locator("button, input[type=submit], input[type=button]").filter({ hasText: exact, visible: true }));
  }
  if (selector.startsWith("link:")) return page.getByRole("link", { name: selector.slice(5), exact: true });
  return page.locator(selector);
}

/** The page's main heading, for checking a recorded step is on the same page. */
export const headingOf = (s: PageState) => s.headings[0] ?? s.title;

/** The visible text the model gets: at most 2,000 characters. */
export const shortText = (s: PageState) => s.text.replace(/\n{3,}/g, "\n\n").slice(0, 2000);
