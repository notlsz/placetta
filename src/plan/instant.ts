/* The first answer, before the model's. Perplexity shows an answer while its agent is still working; Odelia's mapping
   runs spend most of their time writing applications, so the person used to see nothing but steps until the end
   (modeled 24 s at p95 on the 60 fixtures). The moment the registry's lookup (find_official_forms) comes back, this
   writes one line from it into the draft the app shows: how many filings the agencies' own pages back, the first two
   by name and agency, how many are still to confirm, and that the work goes on. Only rows with a current quote are
   named (claim true), nothing is invented, and the model's own reply replaces the line when it writes. Pure. */

type Row = { title?: unknown; agency?: unknown; claim?: unknown; in_workspace?: unknown };

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The line, or null when the lookup has nothing to say yet (an error, a search for one form, no backed row). */
export function instantAnswer(result: string, lang: "en" | "zh"): string | null {
  let r: { forms?: Row[]; place?: unknown; city?: unknown } | null = null;
  try { r = JSON.parse(result); } catch { return null; }
  const forms = Array.isArray(r?.forms) ? r!.forms : [];
  // what's already in the workspace isn't new news; a short list is a search, not a plan
  const fresh = forms.filter(f => !f.in_workspace);
  const backed = fresh.filter(f => f.claim === true && s(f.title) && s(f.agency));
  if (fresh.length < 2 || !backed.length) return null;
  const open = fresh.length - backed.length;
  const place = s(r?.city) || s(r?.place).split(";")[0];
  const top = backed.slice(0, 2);
  if (lang === "zh") {
    const named = top.map(f => `${s(f.title)}（${s(f.agency)}）`).join("、");
    return `${place ? place + "：" : ""}机构官网确认的申报 ${backed.length} 项，先是${named}${open ? `，另有 ${open} 项待向机构确认` : ""}。正在逐项准备。`;
  }
  const named = top.map(f => `${s(f.title)} (${s(f.agency)})`).join(" and ");
  return `${place ? place + ": " : ""}${backed.length} filing${backed.length === 1 ? "" : "s"} the agencies' own pages back, starting with ${named}${open ? `, and ${open} more to confirm with the agency` : ""}. Preparing them now.`;
}
