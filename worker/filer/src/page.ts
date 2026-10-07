// Reading a page into a compact state, and turning the worker's stable selectors back into Playwright locators.
//
// Selectors: "label:<text>" (getByLabel, exact), "button:<text>", "link:<text>", or a CSS selector built from
// id or name ("#id", "[name=\"x\"]"). Labels first, so a recorded step survives cosmetic changes to the page.
import type { Locator, Page } from "playwright-core";
import type { PageState } from "./guards.ts";

export async function pageState(page: Page): Promise<PageState> {
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
      if (!visible(el) && type !== "file") continue;
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
      text: (document.body?.innerText ?? "").slice(0, 6000),
    };
  });
  const dup = new Map(s.labels as [string, number][]);
  const controls = (s.controls as Omit<PageState["controls"][number], "selector">[]).map((c) => ({
    ...c,
    selector: c.label && dup.get(c.label) === 1 && c.type !== "radio" ? `label:${c.label}` : c.id ? `#${c.id}` : c.name ? `[name="${c.name}"]` : `label:${c.label}`,
  }));
  return {
    url: s.url, title: s.title, headings: s.headings, controls,
    buttons: s.buttons.map((t: string) => ({ selector: `button:${t}`, text: t })),
    links: s.links.map((l: { text: string; href: string }) => ({ selector: `link:${l.text}`, text: l.text, href: l.href })),
    text: s.text, frames: s.frames, markers: s.markers,
  };
}

/** The selector as a Playwright locator. */
export function locate(page: Page, selector: string): Locator {
  if (selector.startsWith("label:")) return page.getByLabel(selector.slice(6), { exact: true });
  if (selector.startsWith("button:")) return page.getByRole("button", { name: selector.slice(7), exact: true });
  if (selector.startsWith("link:")) return page.getByRole("link", { name: selector.slice(5), exact: true });
  return page.locator(selector);
}

/** The page's main heading, for checking a recorded step is on the same page. */
export const headingOf = (s: PageState) => s.headings[0] ?? s.title;

/** The visible text the model gets: at most 2,000 characters. */
export const shortText = (s: PageState) => s.text.replace(/\n{3,}/g, "\n\n").slice(0, 2000);
