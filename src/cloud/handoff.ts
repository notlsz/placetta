import type { Lang } from "../i18n";

/* The website's "Get my plan" questionnaire hands its answers to the app on the same site (localStorage, never the URL),
   so sign-in and onboarding open already filled in, and the agent starts mapping licenses as soon as the workspace exists. */

const KEY = "placetta-handoff";
const AUTO = "placetta-autostart";
const DAYS = 3;

/** What the website saves (see site/index.html, submit()). */
type Saved = { v: 1; at: number; email?: string; company?: string; market?: string; industry?: string; opening?: string; plang?: string };

export type Handoff = { email: string; brand: string; place: string; sell: string; other: string; when: number; lang?: Lang };

const PLACES: Record<string, string> = { "San Francisco Bay Area": "San Francisco, CA", "Several markets": "" };
const SELL: Record<string, [string, string]> = { retail: ["Retail", ""], health: ["other", "Health and wellness"], fitness: ["other", "Fitness"] };
/** The website's opening choices to the app's WHEN chips (0 within 3 months, 1 in 3 to 6, 2 in 6 to 12, 4 not sure). */
const WHEN: Record<string, number> = { "3m": 0, "6m": 1, "12m": 2, "12m+": 4, unsure: 4 };

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export function readHandoff(): Handoff | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (!s || s.v !== 1 || typeof s.at !== "number" || Date.now() - s.at > DAYS * 864e5) return null;
    const market = clip(s.market, 80);
    const [sell, other] = SELL[clip(s.industry, 20)] ?? ["", ""];
    const email = clip(s.email, 254);
    return {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "",
      brand: clip(s.company, 120),
      place: market in PLACES ? PLACES[market] : market,
      sell, other,
      when: WHEN[clip(s.opening, 10)] ?? -1,
      lang: s.plang === "zh" || s.plang === "en" ? s.plang : undefined,
    };
  } catch { return null; }
}

/** Once the workspace exists the answers are used up; the agent starts on the next screen. */
export function consumeHandoff() {
  try { localStorage.removeItem(KEY); sessionStorage.setItem(AUTO, "1"); } catch { /* storage blocked */ }
}

/** True once, right after a workspace was created from the website's answers. */
export function takeAutostart(): boolean {
  try { if (sessionStorage.getItem(AUTO) !== "1") return false; sessionStorage.removeItem(AUTO); return true; } catch { return false; }
}
