// The filled form a reply hands back outside the app (src/forms/versions.ts). By email it goes as an attachment; by
// SMS, iMessage, WhatsApp, WeChat, Slack or Lark the reply ends with a short link that opens it in the app, only for a
// member of the workspace and only for seven days (supabase/migrations/20261018090000_form_links.sql: the link's token
// is random and kept on the server, so it can't be guessed or made up).

export type Bi = { en: string; zh: string };
/** What a run filled (src/core.ts FilledNote): the form, its new version, how many lines changed, where the PDF is. */
export type FilledForm = { app: string; form: string; version: number; changed: number; filled: number; ok: boolean; path?: string; problem?: Bi; link?: string };
type Lang = "en" | "zh";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
/** A random token for a link: 14 characters, hard to guess, easy to text. */
export function formToken(n = 14): string {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join("");
}
/** The link the app opens: the workspace, and the token it trades for the form (src/cloud/Root.tsx reads f=). */
export const formLinkUrl = (origin: string, ws: string, token: string) => (origin ? `${origin}/app/?ws=${encodeURIComponent(ws)}&f=${token}` : "");
/** The file's name, as it's kept in Documents. */
export const formFileName = (f: Pick<FilledForm, "form" | "version">) => `${f.form}, filled, version ${f.version}.pdf`;

/** "Filled: DE 1, version 2, 3 lines changed", in the person's language. */
export function filledSay(f: FilledForm, lang: Lang): string {
  const n = f.version > 1 ? f.changed : f.filled;
  if (lang === "zh") return `已填写：${f.form}，第 ${f.version} 版，${f.version > 1 ? `${n} 行有改动` : `已填 ${n} 行`}${f.ok ? "" : `。还不能提交：${f.problem?.zh ?? "有一行与答案不符"}`}`;
  return `Filled: ${f.form}, version ${f.version}, ${n} line${n === 1 ? "" : "s"} ${f.version > 1 ? "changed" : "filled"}${f.ok ? "" : `. Not ready to file yet: ${f.problem?.en ?? "a line doesn't match the answers"}`}`;
}
/** The lines a reply ends with: each filled form, and its link when there is one. */
export function filledLines(forms: FilledForm[], lang: Lang): string {
  return forms.slice(0, 3).map((f) => `${filledSay(f, lang)}${f.link ? (lang === "zh" ? `。查看：${f.link}` : `. View it: ${f.link}`) : lang === "zh" ? "。" : "."}`).join("\n");
}

// deno-lint-ignore no-explicit-any
type Db = any;
/** A link for each filled form that's kept in Documents, valid for seven days. A form whose link couldn't be made goes
 *  back without one (the reply still says it was filled; the app has it in Documents). */
export async function linkForms(db: Db, o: { ws: string; by: string | null; origin: string; forms: FilledForm[]; days?: number }): Promise<FilledForm[]> {
  const out: FilledForm[] = [];
  for (const f of o.forms.slice(0, 3)) {
    if (!f.path || !o.origin || !f.path.startsWith(o.ws + "/")) { out.push(f); continue; }
    const token = formToken();
    const expires = new Date(Date.now() + (o.days ?? 7) * 864e5).toISOString();
    const { error } = await db.from("form_links").insert({ token, workspace_id: o.ws, app_id: f.app, version: f.version, path: f.path, name: formFileName(f), created_by: o.by, expires_at: expires });
    out.push(error ? f : { ...f, link: formLinkUrl(o.origin, o.ws, token) });
  }
  return out;
}

/** The filled PDFs themselves, for an email: at most three, at most 9 MB together, only the workspace's own files. */
export async function formAttachments(db: Db, ws: string, forms: FilledForm[]): Promise<{ name: string; content: Uint8Array; type: string }[]> {
  const out: { name: string; content: Uint8Array; type: string }[] = [];
  let total = 0;
  for (const f of forms.slice(0, 3)) {
    if (!f.path?.startsWith(ws + "/")) continue;
    const { data, error } = await db.storage.from("documents").download(f.path);
    if (error || !data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (total + bytes.length > 9_000_000) break;
    total += bytes.length;
    out.push({ name: formFileName(f), content: bytes, type: "application/pdf" });
  }
  return out;
}
