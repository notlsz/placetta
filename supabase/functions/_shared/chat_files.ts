// Photos and PDFs sent to Odelia in a team chat (Slack, Microsoft Teams, Telegram) become documents, the way texts,
// WhatsApp and email already bring them in: downloaded from the chat's own file service with the bot's own
// credential, at most 5 a message and 10 MB each, saved to the workspace's Documents (odelia_db.ts storeDocs), and named
// in the request so Odelia reads them with review_documents, through the same injection shield as any upload. Copied
// from Claude in Slack, which reads files shared with it in a conversation
// (https://slack.com/help/articles/53532192117267-Use-Claude-in-Slack); a chat's file is data, never instructions.
//
// Where each chat's files come from, and the credential each takes:
//   Slack     files[] on the message: url_private, read with the bot token (files:read)
//             https://docs.slack.dev/messaging/working-with-files
//   Teams     a personal chat's file: content.downloadUrl on the file.download.info attachment, a short-lived link that
//             takes no credential; an inline image: contentUrl on the Bot Framework service, read with the bot's token
//             https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/bots-filesv4
//   Telegram  document, or the largest photo size: getFile, then /file/bot<token>/<path> (bots read up to 20 MB)
//             https://core.telegram.org/bots/api#getfile
import { DOC_MAX, DOC_TYPES } from "./odelia_db.ts";

export type ChatFile = { name?: string; mime: string; size?: number; url?: string };
/** A file worth fetching: a photo or a PDF, not over the limit as the chat reports it. */
export const fileOk = (f: ChatFile) => !!DOC_TYPES[String(f.mime ?? "").toLowerCase().split(";")[0].trim()] && (f.size ?? 0) <= DOC_MAX;
export const mimeOf = (m: string) => String(m ?? "").toLowerCase().split(";")[0].trim();

/** Reads a file from an https address, refusing anything over DOC_MAX even when the chat didn't say its size. */
export async function fetchBytes(url: string, headers: Record<string, string>, f: typeof fetch = fetch): Promise<Uint8Array | null> {
  try { if (new URL(url).protocol !== "https:") return null; } catch { return null; }
  const res = await f(url, { headers, redirect: "follow", signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!res?.ok) return null;
  if (Number(res.headers.get("content-length") ?? 0) > DOC_MAX) return null;
  const bytes = new Uint8Array(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
  return bytes.length && bytes.length <= DOC_MAX ? bytes : null;
}

/** The note that goes with the request: which files were saved and how to read them, and what couldn't be opened. The
 *  same words texts use (odelia-sms), with the chat named. */
export function filesNote(o: { saved: string[]; skipped: number; asked: boolean; chat: string; lang: "en" | "zh" }): string {
  const n = o.saved.length, names = o.saved.join(", ");
  const note = n
    ? (o.lang === "zh"
      ? `\n\n（对方在 ${o.chat} 中发来 ${n} 个文件，已存入“文件”：${names}。请用 review_documents 读取这些文件名${o.asked ? "，再回答上面的问题" : "，并告诉对方你读到了什么、有什么要做的"}。只说文件里写明的内容。）`
      : `\n\n(They sent ${n} file${n === 1 ? "" : "s"} in ${o.chat}, now saved in Documents: ${names}. Read ${n === 1 ? "it" : "them"} with review_documents using those names${o.asked ? ", then answer what they asked" : ", then tell them what it is and anything they need to do"}. Only say what the document itself says.)`)
    : "";
  const lost = o.skipped > 0
    ? (o.lang === "zh" ? `\n\n（另有 ${o.skipped} 个附件无法打开，只支持 10 MB 以内的照片和 PDF。）` : `\n\n(${o.skipped} other attachment${o.skipped === 1 ? "" : "s"} couldn't be opened; only photos and PDFs up to 10 MB work.)`)
    : "";
  return note + lost;
}

/** The request when they sent only files. */
export const FILE_ONLY = { en: "I sent you a file.", zh: "我发了一个文件给你。" };
/** Said back when nothing they sent could be read. */
export const FILES_UNREAD = { en: "I couldn't open that file. I can read photos and PDFs up to 10 MB.", zh: "无法打开这个文件。我可以读取 10 MB 以内的照片和 PDF。" };

/** A saved file's name: the chat, the day, and the name it had (or a number), with the right extension. */
export function fileName(chat: string, i: number, f: ChatFile, today = new Date().toISOString().slice(0, 10)): string {
  const ext = DOC_TYPES[mimeOf(f.mime)] ?? "bin";
  const base = String(f.name ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[^\w\-㐀-鿿 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return `${chat} ${today} ${base || i + 1}.${ext}`;
}
