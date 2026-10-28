// Which way Odelia reaches an owner, the way Instinct does it: one channel per update, the cheapest one that reaches
// them, and only what they asked for. Pure, so deliver_test.ts covers every case; odelia_db.ts (textUser), the monitor
// and agent-run call it.
//
//   The phone route of one text (routeFor):
//     WhatsApp      they last wrote on WhatsApp: back there (free-form in the 24-hour window, the template outside it)
//     a reply       back the way they wrote: the iMessage line (Linq), or Odelia's Telnyx number if that's where it came
//     an update     iMessage when their phone takes it and they already have a conversation with a line (Linq's rule:
//                   Odelia never opens a conversation except with the verification code); Telnyx SMS when it doesn't
//                   (an Android phone, as Linq reported) or when there's no conversation yet. iMessage is the flat fee,
//                   SMS is per segment, so a text that can go by iMessage does.
//   The channel of one update (updateChannel): one only, never the same update twice.
//     urgent        a call if they turned calls on, else a text, else an email
//     important     a text if texts are on, unless they said email; else an email
//     routine       an email (the morning digest), or a text if they asked for texts
//   What they said in the app (reach.ts) wins: never a channel they said not to use.
import type { Reach } from "./reach.ts";

export type PhoneRoute = "whatsapp" | "imessage" | "sms";
export type RouteIn = {
  /** where they last wrote from: "whatsapp", "sms" (Odelia's Telnyx number), or null (an iMessage line, or never) */
  via?: string | null;
  /** the iMessage line they have a conversation with */
  line?: string | null;
  /** whether their phone takes iMessage, as Linq last said; null when unknown */
  imessage?: boolean | null;
  reply: boolean;
  linq: boolean; sms: boolean; whatsapp: boolean;
};

export function routeFor(o: RouteIn): PhoneRoute | null {
  if (o.via === "whatsapp" && o.whatsapp) return "whatsapp";
  if (o.reply) {
    if (o.via === "sms" && o.sms) return "sms";
    if (o.linq) return "imessage";
    return o.sms ? "sms" : null;
  }
  if (o.linq) {
    if (o.sms && (o.imessage === false || !o.line)) return "sms";
    return "imessage";
  }
  return o.sms ? "sms" : null;
}

export type Level = "urgent" | "important" | null;
export type UpdateChannel = "call" | "text" | "email" | "none";
export type Reachable = { reach: Reach; phone: { texts: boolean; calls: boolean } | null; email: boolean };

export function updateChannel(level: Level, p: Reachable): UpdateChannel {
  const no = new Set(p.reach.avoid);
  const call = !!p.phone?.calls && !no.has("call"), text = !!p.phone?.texts && !no.has("text"), email = p.email && !no.has("email");
  if (level === "urgent") return call ? "call" : text ? "text" : email ? "email" : "none";
  if (level === "important") {
    if (p.reach.prefer === "email" && email) return "email";
    return text ? "text" : email ? "email" : "none";
  }
  if (p.reach.prefer === "text" && text) return "text";
  return email ? "email" : text && no.has("email") ? "text" : "none";
}

/** Linq's word for the service a message went by, as whether the phone takes iMessage (null when it doesn't say). */
export function takesIMessage(service: string | null | undefined): boolean | null {
  if (service === "iMessage") return true;
  if (service === "SMS" || service === "RCS") return false;
  return null;
}
