// Dropbox Sign: a document from Documents sent for signature from the business's own Dropbox Sign account, and where
// each signer stands. For the papers a filing needs from someone else's hand (the landlord's authorization letter, a
// contractor's statement), not for the agency's own forms, which keep their own signing rules.
//   POST https://api.hellosign.com/v3/signature_request/send   files or file_urls, signers, test_mode
//   GET  https://api.hellosign.com/v3/signature_request/{id}
//   (https://developers.hellosign.com/api/signature-request/send.md, https://developers.hellosign.com/api/quickstart/)
// The API key goes as HTTP Basic, the key then a colon and no password ("-u 'YOUR_API_KEY:'" in the quickstart). The
// file goes in the request itself, so no link to a document is ever handed out. An owner sends; the click is the
// approval, as with every send. Free of the database and of Deno.env; tested with recorded answers (esign_test.ts).

export const DS_API = "https://api.hellosign.com/v3";
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type Signer = { name: string; email: string };
export type SignStatus = { id: string; title: string; complete: boolean; declined: boolean; signers: { email: string; status: string; signed_at: string | null }[] };

export class SignError extends Error {
  constructor(readonly status: number, message: string, readonly zh: string) { super(message); }
}

export const basic = (key: string) => `Basic ${btoa(`${key}:`)}`;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;

async function dsJson<T>(f: Fetch, key: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await f(`${DS_API}${path}`, { ...init, headers: { Authorization: basic(key), Accept: "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30000) });
  } catch {
    throw new SignError(502, "Dropbox Sign did not respond. Try again.", "Dropbox Sign 没有响应，请重试。");
  }
  const j = (await res.json().catch(() => ({}))) as T & { error?: { error_name?: string } };
  if (res.status === 401) throw new SignError(401, "Dropbox Sign refused the API key. Paste a current one in Settings.", "Dropbox Sign 拒绝了 API 密钥。请在设置中粘贴有效的密钥。");
  if (res.status === 402 || res.status === 403) throw new SignError(403, "Dropbox Sign refused: the account's plan may not include API requests.", "Dropbox Sign 拒绝了请求：该账户的套餐可能不含 API 请求。");
  if (!res.ok) throw new SignError(res.status, `Dropbox Sign returned an error (${j.error?.error_name ?? res.status}).`, `Dropbox Sign 返回错误（${j.error?.error_name ?? res.status}）。`);
  return j;
}

/** The account the key belongs to: its email, shown in Settings as the connected account. */
export async function dsAccount(f: Fetch, key: string): Promise<string | null> {
  const j = await dsJson<{ account?: { email_address?: string } }>(f, key, "/account");
  return typeof j.account?.email_address === "string" ? j.account.email_address : null;
}

function statusOf(r: Record<string, unknown> | undefined): SignStatus {
  const sr = r ?? {};
  const sigs = Array.isArray(sr.signatures) ? (sr.signatures as Record<string, unknown>[]) : [];
  return {
    id: String(sr.signature_request_id ?? ""), title: String(sr.title ?? ""), complete: sr.is_complete === true, declined: sr.is_declined === true,
    signers: sigs.map((x) => ({ email: String(x.signer_email_address ?? ""), status: String(x.status_code ?? ""), signed_at: typeof x.signed_at === "number" ? new Date(x.signed_at * 1000).toISOString() : null })),
  };
}

/** Check what's sent before anything goes out: 1 to 5 signers with a name and a real email, one file, a title. */
export function checkSend(o: { title: string; signers: unknown; file?: { name: string; bytes: Uint8Array } }): Signer[] {
  if (!o.title.trim() || o.title.length > 200) throw new SignError(400, "Give the request a title (at most 200 characters).", "请填写标题（最多 200 字）。");
  const list = Array.isArray(o.signers) ? o.signers : [];
  if (!list.length || list.length > 5) throw new SignError(400, "Add 1 to 5 signers.", "请添加 1 到 5 位签署人。");
  const out = list.map((x) => ({ name: String((x as Signer)?.name ?? "").trim().slice(0, 120), email: String((x as Signer)?.email ?? "").trim().toLowerCase() }));
  const bad = out.find((x) => !x.name || !EMAIL.test(x.email));
  if (bad) throw new SignError(400, `Each signer needs a name and an email address${bad.email ? ` (check ${bad.email})` : ""}.`, `每位签署人都需要姓名和邮箱${bad.email ? `（请检查 ${bad.email}）` : ""}。`);
  if (!o.file?.bytes.length) throw new SignError(400, "Choose the document to sign.", "请选择要签署的文件。");
  return out;
}

/** Send one document for signature. test: Dropbox Sign's test mode (not legally binding), for a sandbox. */
export async function dsSend(f: Fetch, key: string, o: { title: string; subject?: string; message?: string; signers: Signer[]; file: { name: string; mime: string; bytes: Uint8Array }; test: boolean }): Promise<SignStatus> {
  const form = new FormData();
  form.set("title", o.title);
  if (o.subject) form.set("subject", o.subject.slice(0, 200));
  if (o.message) form.set("message", o.message.slice(0, 2000));
  o.signers.forEach((x, i) => { form.set(`signers[${i}][name]`, x.name); form.set(`signers[${i}][email_address]`, x.email); });
  form.set("files[0]", new Blob([o.file.bytes as Uint8Array<ArrayBuffer>], { type: o.file.mime }), o.file.name);
  form.set("test_mode", o.test ? "1" : "0");
  const j = await dsJson<{ signature_request?: Record<string, unknown> }>(f, key, "/signature_request/send", { method: "POST", body: form });
  const st = statusOf(j.signature_request);
  if (!/^[0-9a-f]{20,64}$/i.test(st.id)) throw new SignError(502, "Dropbox Sign didn't return the request. Check it in Dropbox Sign before sending again.", "Dropbox Sign 没有返回签署请求。再次发送前请先在 Dropbox Sign 中查看。");
  return st;
}

export async function dsStatus(f: Fetch, key: string, id: string): Promise<SignStatus> {
  if (!/^[0-9a-f]{20,64}$/i.test(id)) throw new SignError(400, "That isn't a Dropbox Sign request id.", "这不是 Dropbox Sign 的签署请求编号。");
  const j = await dsJson<{ signature_request?: Record<string, unknown> }>(f, key, `/signature_request/${id}`);
  return statusOf(j.signature_request);
}
