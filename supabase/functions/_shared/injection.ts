// The injection detector's rules, with no imports, so the portal filer (worker/filer, which runs this file with Node)
// and the agent (src/security/detect.ts, which adds hidden-text handling and the optional model check) score text the
// same way. Plain regular expressions over the text and a folded copy of it: no model.

export type Verdict = "clean" | "flagged" | "quarantined";

/** At or above FLAG the content is flagged; at or above QUARANTINE it's withheld. */
export const FLAG = 3, QUARANTINE = 6;

/** The tools that change something, by name: text that tells an AI to call one is an instruction. */
const TOOL_NAMES = "request_filing_approval|request_purchase|send_email|draft_message|remove_store|remove_application|change_setting|set_budgets|edit_workspace|update_store|memory_save|skill_save|schedule_routine|split_job|import_file|fill_fields|prepare_application|remember";

type Rule = { re: RegExp; w: number; why: string };
const RULES: Rule[] = [
  // talking to the model as a model
  { re: /<\|?(im_start|im_end|system|assistant|endoftext)\|?>|\[\/?INST\]|<<\/?SYS>>|\bBEGIN (SYSTEM|ADMIN|DEVELOPER) (PROMPT|INSTRUCTIONS?|MESSAGE)\b|^#{2,}\s*(system|instructions?|new task)\b/im, w: 4, why: "chat-template or role markers" },
  { re: /^\s*(system|assistant|developer)\s*:\s*\S/im, w: 3, why: "a line written as the system or assistant" },
  { re: /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,50}\b(previous|prior|above|earlier|all|your|the|any|safety|system)\b[^.\n]{0,30}\b(instructions?|rules|prompts?|guidelines|directions|guardrails|policies|messages?)\b/i, w: 4, why: "asks to ignore instructions" },
  { re: /\b(you are now|from now on,? you|act as (an?|the|my)\b|pretend (to be|you are)|roleplay as|new persona|developer mode|jailbreak|DAN mode)\b/i, w: 3, why: "tries to change who the assistant is" },
  { re: /\b(note|message|instructions?|memo|directive|update)\s+(to|for)\s+(the\s+)?(ai|assistant|ai agent|odelia|chatbot|language model|llm|automated (system|agent))\b/i, w: 3, why: "addressed to the AI" },
  { re: /\b(ai|assistant|ai agent|automated agent|odelia|chatbot|language model|llm)\b[^.\n]{0,60}\b(must|should|shall|needs? to|is required to|are required to|has to|will now)\b[^.\n]{0,60}\b(send|email|forward|file|pay|approve|submit|wire|transfer|delete|remove|share|upload|post|reply|call|text|change|update|add|visit|open|click|fetch)\b/i, w: 4, why: "tells the AI to act" },
  { re: new RegExp(`\\b(call|use|run|invoke|execute|trigger)\\b[^.\\n]{0,20}\\b(the\\s+)?\`?(${TOOL_NAMES})\`?`, "i"), w: 4, why: "names one of Odelia's tools to call" },
  { re: /\b(do not|don't|never|without)\b[^.\n]{0,20}\b(tell(ing)?|inform(ing)?|notify(ing)?|mention(ing)?|alert(ing)?|ask(ing)?|reveal(ing)?|show(ing)?)\b[^.\n]{0,20}\b(the\s+)?(user|owner|person|customer|human|client|manager|anyone)\b/i, w: 3, why: "asks to keep it from the person" },
  { re: /\b(secretly|silently|quietly|covertly|without (their|the owner'?s?|the user'?s?|any) (knowledge|approval|consent))\b/i, w: 2, why: "asks for secrecy" },
  { re: /\b(this is|message from|instructions? from|on behalf of|signed,?)\s+(placetta|anthropic|openai|the (system|developer|administrator|admin|platform)|your (developer|creator|operator|administrator))\b/i, w: 3, why: "claims to speak for Placetta or the system" },
  { re: /\b(the )?(owner|admin|administrator|user|customer) (has )?(already )?(approved|authori[sz]ed|pre-?approved|consented to|signed off on)\b[^.\n]{0,60}\b(send|pay|file|transfer|wire|share|email|delete|this|it)\b/i, w: 3, why: "claims the owner already approved" },
  { re: /\b(approval|confirmation|verification) (is )?(not|no longer) (required|needed)\b|\bskip (the )?(approval|confirmation|review)\b|\bauto-?approve\b/i, w: 4, why: "asks to skip the approval" },
  { re: /\b(email|send|forward|text|fax|wire|transfer|upload|post|share|disclose|leak)\b[^.\n]{0,60}\b(ein|ssn|social security|itin|tax id|taxpayer|bank|account number|routing|password|passcode|passport|credit card|card number|api key|token|credentials?|secret|login)\b[^.\n]{0,80}(\bto\b|@|https?:)/i, w: 4, why: "asks to send private data somewhere" },
  { re: /!\[[^\]]*\]\(\s*https?:\/\/[^)\s]*[?#][^)\s]*\)/i, w: 4, why: "a markdown image that carries data in its address" },
  { re: /\b(append|add|include|put|encode|insert)\b[^.\n]{0,60}\b(to|in|into|as)\b[^.\n]{0,20}\b(the\s+)?(url|link|query string|image|address|parameter)\b/i, w: 3, why: "asks to put data in a link" },
  { re: /\b(render|display|show|output|include|load|fetch|visit|open)\b[^.\n]{0,30}\b(this|the following|an?)\s+(image|url|link|address|page)\b[^.\n]{0,40}https?:\/\//i, w: 3, why: "asks to load a link" },
  { re: /\b(change|update|set|replace)\b[^.\n]{0,30}\b(the\s+)?(bank|routing|account|payee|payment|remit(tance)?|deposit)\b[^.\n]{0,40}\b(to|with)\b/i, w: 2, why: "asks to change payment details" },
  { re: /\b(urgent|immediately|right away|asap|within the hour)\b[^.\n]{0,60}\b(approve|pay|wire|transfer|send|submit|file)\b/i, w: 1, why: "urgency" },
  { re: /\b(end of (document|email|message|context)|---+\s*end\s*---+|<\/(document|email|context|data|untrusted-data)>)/i, w: 2, why: "pretends the data ended" },
  // Chinese
  { re: /(忽略|无视|忘记|跳过)[^。\n]{0,16}(之前|以上|上面|所有|你的|系统)?[^。\n]{0,6}(指令|指示|规则|提示|设定|要求)/, w: 4, why: "asks to ignore instructions (Chinese)" },
  { re: /(你现在是|从现在起你|扮演|假装你是)/, w: 3, why: "tries to change who the assistant is (Chinese)" },
  { re: /(不要|别|无需)[^。\n]{0,8}(告诉|通知|告知|提醒)[^。\n]{0,8}(用户|老板|负责人|所有者|客户)/, w: 3, why: "asks to keep it from the person (Chinese)" },
  { re: /(AI|助手|智能体|机器人|Odelia)[^。\n]{0,20}(必须|应当|应该|需要|立即)[^。\n]{0,20}(发送|转发|付款|支付|提交|删除|批准|转账)/i, w: 4, why: "tells the AI to act (Chinese)" },
  { re: /(发送|转发|发给|邮寄|传真|上传)[^。\n]{0,30}(EIN|税号|社会安全号|社安号|银行|账号|密码|护照|密钥)/i, w: 4, why: "asks to send private data (Chinese)" },
  { re: /(系统提示|系统消息|开发者消息|管理员指令)/, w: 3, why: "claims to be a system message (Chinese)" },
];

/** Cyrillic and Greek letters that look Latin, and digits used as letters. */
const HOMO: Record<string, string> = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ɡ": "g", "һ": "h", "ӏ": "l", "ο": "o", "α": "a", "ε": "e", "ι": "i", "ν": "v", "τ": "t", "κ": "k", "ρ": "p", "υ": "u", "Α": "A", "Β": "B", "Ε": "E", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Χ": "X", "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X" };
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

/** The text with its disguises folded: look-alike letters, leetspeak inside words, s p a c e d or s.p.l.i.t letters. */
export function fold(s: string): string {
  let t = [...s.normalize("NFKC")].map(c => HOMO[c] ?? c).join("");
  // leetspeak only inside words that are mostly letters ("ign0re", "1nstructions"), so numbers stay numbers
  t = t.replace(/\b[\w@$!]*[a-z][\w@$!]*\b/gi, w => (/[a-z]{2}/i.test(w) && !/^\d+[a-z]{1,4}$/i.test(w) ? w.replace(/[013457@$!]/g, c => LEET[c] ?? c) : w));
  // single letters separated by one space, dot, dash or underscore, five or more in a row: "i g n o r e"
  t = t.replace(/\b(?:[a-z][ ._-]){4,}[a-z]\b/gi, w => w.replace(/[ ._-]/g, ""));
  return t;
}

/** Base64 runs that decode to readable text: what they say. */
export function decoded(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/[A-Za-z0-9+/]{32,}={0,2}/g)) {
    try {
      const raw = atob(m[0].length % 4 ? m[0] + "=".repeat(4 - (m[0].length % 4)) : m[0]);
      const printable = raw.replace(/[^\x20-\x7e\n]/g, "");
      if (printable.length > raw.length * 0.9 && /[a-z]{3,}\s+[a-z]{2,}/i.test(printable)) out.push(printable.slice(0, 2000));
    } catch { /* not base64 */ }
    if (out.length >= 5) break;
  }
  return out;
}

export function score(text: string, where: string, hits: string[], quotes: string[], seen: Set<string> = new Set()): number {
  let total = 0;
  for (const r of RULES) {
    const m = r.re.exec(text);
    if (!m || seen.has(r.why)) continue;
    seen.add(r.why);
    total += r.w;
    hits.push(where ? `${r.why} (${where})` : r.why);
    if (quotes.length < 3) quotes.push(around(text, m.index, m[0].length));
  }
  return total;
}

/** The words a person reads in the audit trail and the reply: the match with the rest of its line, up to 200 characters.
 *  A rule that matches only a line's start ("SYSTEM: i") would otherwise quote a fragment nobody can recognize. */
function around(text: string, at: number, len: number): string {
  // from the start of the match's sentence (or line), at most 80 characters back
  const before = text.slice(Math.max(text.lastIndexOf("\n", at) + 1, at - 80), at);
  const cut = Math.max(before.lastIndexOf(". "), before.lastIndexOf("。"), before.lastIndexOf("! "), before.lastIndexOf("? "));
  const start = at - before.length + (cut >= 0 ? cut + 1 : 0);
  const nl = text.indexOf("\n", at + len), end = Math.min(nl < 0 ? text.length : nl, Math.max(at + len, start + 200));
  return text.slice(start, end).trim();
}


/** A text's score and verdict on its own (no hidden text): what the filer uses for a portal page. */
export function scoreText(text: string): { score: number; hits: string[]; verdict: Verdict; quote: string | null } {
  const hits: string[] = [], quotes: string[] = [], seen = new Set<string>();
  let total = score(text, "", hits, quotes, seen);
  const folded = fold(text);
  if (folded !== text) total += score(folded, "disguised", hits, quotes, new Set(seen));
  for (const d of decoded(text)) { const add = score(d, "base64", hits, quotes); if (add) total += add + 1; }
  return { score: total, hits, verdict: total >= QUARANTINE ? "quarantined" : total >= FLAG ? "flagged" : "clean", quote: quotes[0]?.replace(/\s+/g, " ").trim().slice(0, 200) ?? null };
}
