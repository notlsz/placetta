// The voice brain: who does the talking on a call or in the app, behind one interface so it can be swapped.
//
// Placetta keeps the carrier (its own Telnyx account: numbers, SIP, recording) and everything that matters: who the
// caller is, history and memory, the tools, the approval gates and the handoff to the team. A brain only holds the
// conversation: it hears, thinks a turn, speaks, and calls Placetta's tools (an MCP server at odelia-voice, or tool
// webhooks for Telnyx's engine), each with a token signed for that one call.
//
// Two paths, the same interface:
//   speech to speech  OpenAI gpt-realtime. Telnyx bridges the call to OpenAI's SIP endpoint; the app talks to it over
//                     WebRTC with a short-lived key. The default for owners and, per the founder, for Mandarin.
//   cascaded          Telnyx's own voice AI engine: speech to text, our instructions and tools, then a TTS voice picked
//                     per language (ElevenLabs Flash, Cartesia Sonic-3, MiniMax, or Telnyx's included voices). For
//                     outbound agency calls where the most human voice matters.
// Gemini Live and xAI Grok Voice speak WebSocket only (no SIP), so on the phone they need a media bridge
// (VOICE_BRIDGE_URL, not built); in the app they take a short-lived token like OpenAI's. Their configs are here so a
// switch is one setting.
//
// Prices are list prices read on 2026-10-23 (docs/CHANNELS.md has the links). Pure: unit tested in voice_brain_test.ts.

export type Lang = "en" | "zh";
export type BrainId = "openai" | "openai_mini" | "telnyx" | "gemini" | "grok";
export type TtsId = "elevenlabs_flash" | "elevenlabs_multilingual" | "cartesia_sonic3" | "minimax" | "telnyx_included";
export type Surface = "owner_phone" | "agency_phone" | "interpreter_phone" | "app_talk" | "app_interpreter" | "rehearse";
export type Env = (k: string) => string | undefined;

export type Brain = {
  id: BrainId;
  label: string;
  /** The brain's own price a minute of call, low and high, from the vendor's list prices (what the conversation shape
   *  makes it: how much each side talks and how much context is re-read). typical: what the cost model uses. */
  usdPerMin: { low: number; high: number; typical: number };
  /** Time to the first audio of a turn, ms, and whose measurement it is. */
  firstAudioMs: { ms: number; by: string };
  /** How it reaches a phone call on Placetta's Telnyx account. */
  phone: "sip" | "telnyx_engine" | "bridge";
  browser: boolean;
  bargeIn: string;
  zh: string;
  sources: string[];
};

export const BRAINS: Record<BrainId, Brain> = {
  openai: {
    id: "openai", label: "OpenAI gpt-realtime",
    // $32 a million audio tokens in ($0.40 cached), $64 out; 600 tokens a minute heard, 1,200 a minute spoken. Fora Soft's
    // planning range with the prompt cache working is $0.06 to $0.11 a minute.
    usdPerMin: { low: 0.06, high: 0.11, typical: 0.08 },
    firstAudioMs: { ms: 300, by: "Fora Soft's comparison (one model, no cascade)" },
    phone: "sip", browser: true, bargeIn: "native: semantic VAD, interrupt_response", zh: "default for Mandarin (founder's own use); quality check in docs/CHANNELS.md runs as a test, not a gate",
    sources: ["https://developers.openai.com/api/docs/models/gpt-realtime", "https://www.forasoft.com/blog/article/openai-realtime-api-pricing", "https://developers.openai.com/api/docs/guides/realtime-sip"],
  },
  openai_mini: {
    id: "openai_mini", label: "OpenAI gpt-realtime mini",
    // $10 a million audio tokens in, $20 out: $0.02 to $0.05 a minute (Fora Soft).
    usdPerMin: { low: 0.02, high: 0.05, typical: 0.035 },
    firstAudioMs: { ms: 300, by: "Fora Soft's comparison" },
    phone: "sip", browser: true, bargeIn: "native", zh: "same family as gpt-realtime",
    sources: ["https://cloudprice.net/models/gpt-realtime-mini", "https://www.forasoft.com/blog/article/openai-realtime-api-pricing"],
  },
  telnyx: {
    id: "telnyx", label: "Telnyx voice AI engine (cascaded)",
    // $0.05 a minute for orchestration, speech to text and text to speech, plus the model (Kimi on Telnyx's GPUs about
    // $0.006 a minute). A premium TTS voice (ElevenLabs, Cartesia) is billed by that vendor on top: see TTS below.
    usdPerMin: { low: 0.056, high: 0.07, typical: 0.056 },
    firstAudioMs: { ms: 1000, by: "estimate for a cascade (Fora Soft: 600 to 1,100 ms for three hops); Telnyx publishes none" },
    phone: "telnyx_engine", browser: false, bargeIn: "native on Telnyx's side", zh: "Soniox speech to text pinned to Chinese and English; Qwen3 TTS speaks Mandarin natively",
    sources: ["https://telnyx.com/pricing/voice-ai-agents.md"],
  },
  gemini: {
    id: "gemini", label: "Google Gemini 3.1 Flash Live",
    // $3 a million audio tokens in (about $0.005 a minute), $12 out (about $0.018 a minute).
    usdPerMin: { low: 0.012, high: 0.023, typical: 0.016 },
    firstAudioMs: { ms: 0, by: "not published" },
    phone: "bridge", browser: true, bargeIn: "automatic; not configurable (python-genai issue 2029)", zh: "70 languages listed; Mandarin quality not documented",
    sources: ["https://rywalker.com/research/gemini-live-api"],
  },
  grok: {
    id: "grok", label: "xAI Grok Voice (Think Fast 2.0)",
    usdPerMin: { low: 0.08, high: 0.08, typical: 0.08 },
    firstAudioMs: { ms: 700, by: "eesel's comparison table (Think Fast 2.0)" },
    phone: "bridge", browser: true, bargeIn: "server VAD", zh: "\"25+ languages\", not named",
    sources: ["https://docs.x.ai/developers/models/voice-agent-api", "https://www.eesel.ai/blog/grok-voice-think-fast-2-pricing"],
  },
};

/** TTS voices for the cascaded path, per 1,000 characters spoken. Odelia speaks about 400 characters a minute of an agency
 *  call (she listens more than she talks), so a minute costs about 0.4 x this. */
export type Tts = { id: TtsId; label: string; usdPer1kChars: number; firstByteMs: number; zh: boolean; telnyx: string | null; source: string };
export const TTS: Record<TtsId, Tts> = {
  elevenlabs_flash: { id: "elevenlabs_flash", label: "ElevenLabs Flash v2.5", usdPer1kChars: 0.05, firstByteMs: 75, zh: true,
    telnyx: "elevenlabs.eleven_flash_v2_5", source: "https://invideo.io/blog/ai-voice-model-pricing/ (about $50 a million characters); voice string from https://developers.telnyx.com/docs/voice/tts/providers/elevenlabs.md" },
  elevenlabs_multilingual: { id: "elevenlabs_multilingual", label: "ElevenLabs Multilingual v2", usdPer1kChars: 0.1, firstByteMs: 250, zh: true,
    telnyx: "elevenlabs.eleven_multilingual_v2", source: "Retell lists it at $0.06 a minute against Flash's $0.04 (https://www.retellai.com/es/pricing); per character estimated at twice Flash" },
  cartesia_sonic3: { id: "cartesia_sonic3", label: "Cartesia Sonic-3", usdPer1kChars: 0.02, firstByteMs: 90, zh: true,
    telnyx: null, source: "founder's benchmark ($20 a million characters, 85 ms); Vapi measured 166 ms median (https://invideo.io/blog/ai-voice-model-pricing/). Not on Telnyx's provider list, so it needs the media bridge" },
  minimax: { id: "minimax", label: "MiniMax Speech 2.8 turbo", usdPer1kChars: 0.06, firstByteMs: 250, zh: true,
    telnyx: "minimax", source: "https://invideo.io/blog/ai-voice-model-pricing/ ($60 a million); on Telnyx's provider list (https://developers.telnyx.com/docs/voice/tts/voices/alternative-providers.md)" },
  telnyx_included: { id: "telnyx_included", label: "Telnyx Ultra and Qwen3 TTS (included)", usdPer1kChars: 0, firstByteMs: 200, zh: true,
    telnyx: "Telnyx", source: "inside the $0.05 a minute engine rate (https://telnyx.com/pricing/voice-ai-agents.md)" },
};
export const ODELIA_CHARS_PER_MIN = 400;

/* ------------------------------ telephony, all in ------------------------------ */

/** Placetta's Telnyx account, a minute (https://telnyx.com/pricing/voice-api.md): the PSTN leg is the Voice API fee
 *  ($0.002) plus SIP trunking ($0.0032 in, $0.005 out); bridging to OpenAI's SIP endpoint is a second leg (Voice API
 *  $0.002 plus the SIP interface $0.002); recording $0.002; a conference $0.002 a participant. $1 a number a month. */
export const TELNYX = { voiceApi: 0.002, inbound: 0.0032, outbound: 0.005, sipLeg: 0.004, recording: 0.002, conferencePerParty: 0.002, numberMonth: 1, amdPerCall: 0.002 };

export function telephonyPerMin(o: { direction: "in" | "out"; brain: BrainId; recorded: boolean; parties?: number }): number {
  if (o.parties && o.parties > 2) {
    // a three-way interpreter call: two PSTN legs out (owner and agency), the brain's leg, and the conference
    return 2 * (TELNYX.voiceApi + TELNYX.outbound) + (BRAINS[o.brain].phone === "sip" ? TELNYX.sipLeg : 0) + o.parties * TELNYX.conferencePerParty + (o.recorded ? TELNYX.recording : 0);
  }
  const pstn = TELNYX.voiceApi + (o.direction === "in" ? TELNYX.inbound : TELNYX.outbound);
  return pstn + (BRAINS[o.brain].phone === "sip" ? TELNYX.sipLeg : 0) + (o.recorded ? TELNYX.recording : 0);
}

/** One minute of a call, all in: the brain, the TTS voice on the cascaded path, and Telnyx. */
export function perMinute(o: { brain: BrainId; tts?: TtsId; surface: Surface; recorded?: boolean }): number {
  const phone = o.surface.endsWith("_phone");
  const tts = o.brain === "telnyx" && o.tts ? TTS[o.tts].usdPer1kChars * ODELIA_CHARS_PER_MIN / 1000 : 0;
  const tel = phone ? telephonyPerMin({ direction: o.surface === "owner_phone" ? "in" : "out", brain: o.brain, recorded: !!o.recorded, parties: o.surface === "interpreter_phone" ? 3 : 2 }) : 0;
  return round4(BRAINS[o.brain].usdPerMin.typical + tts + tel);
}
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** A store-month of voice: minutes by surface, and what it costs all in, with the number's $1 shared across stores. */
export type VoiceMonth = { ownerPhoneMin: number; appTalkMin: number; agencyCalls: number; agencyCallMin: number; interpreterMin: number; stores?: number };
export const TYPICAL_MONTH: VoiceMonth = { ownerPhoneMin: 10, appTalkMin: 15, agencyCalls: 4, agencyCallMin: 12, interpreterMin: 20 };
export const HEAVY_MONTH: VoiceMonth = { ownerPhoneMin: 60, appTalkMin: 60, agencyCalls: 12, agencyCallMin: 25, interpreterMin: 120 };

export function storeMonth(m: VoiceMonth, pick: (s: Surface) => { brain: BrainId; tts?: TtsId } = defaultPick): { usd: number; lines: Record<string, number> } {
  const line = (s: Surface, min: number, recorded = false) => min * perMinute({ ...pick(s), surface: s, recorded });
  const lines = {
    owner_phone: line("owner_phone", m.ownerPhoneMin),
    app_talk: line("app_talk", m.appTalkMin),
    agency_phone: line("agency_phone", m.agencyCalls * m.agencyCallMin, true) + m.agencyCalls * TELNYX.amdPerCall,
    interpreter: line("app_interpreter", m.interpreterMin),
    number: TELNYX.numberMonth / Math.max(1, m.stores ?? 1),
  };
  const usd = Object.values(lines).reduce((a, b) => a + b, 0);
  return { usd: Math.round(usd * 100) / 100, lines: Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, Math.round(v * 100) / 100])) };
}

/* ------------------------------ which brain, per call ------------------------------ */

const defaultPick = (s: Surface) => pickBrain({ surface: s, lang: "en", env: () => "configured" });

/** Which brains are set up on this server: the keys each one needs. */
export function brainReady(id: BrainId, env: Env): boolean {
  switch (id) {
    case "openai": case "openai_mini": return !!env("OPENAI_API_KEY");
    case "telnyx": return !!(env("TELNYX_API_KEY") && env("TELNYX_ASSISTANT_ID"));
    case "gemini": return !!env("GEMINI_API_KEY");
    case "grok": return !!env("XAI_API_KEY");
  }
}
/** A phone call can only go to a brain that speaks SIP or is Telnyx's own engine, unless a media bridge is set up. And
 *  OpenAI on the phone needs the SIP project id. */
export function phoneReady(id: BrainId, env: Env): boolean {
  const b = BRAINS[id];
  if (b.phone === "bridge") return !!env("VOICE_BRIDGE_URL") && brainReady(id, env);
  if (b.phone === "sip") return brainReady(id, env) && !!env("OPENAI_SIP_PROJECT");
  return brainReady(id, env);
}

const BRAIN_IDS: BrainId[] = ["openai", "openai_mini", "telnyx", "gemini", "grok"];
const TTS_IDS: TtsId[] = ["elevenlabs_flash", "elevenlabs_multilingual", "cartesia_sonic3", "minimax", "telnyx_included"];
const asBrain = (v: string | undefined): BrainId | null => (BRAIN_IDS as string[]).includes(v ?? "") ? v as BrainId : null;
const asTts = (v: string | undefined): TtsId | null => (TTS_IDS as string[]).includes(v ?? "") ? v as TtsId : null;

/**
 * The brain for one conversation. Defaults, per the founder: OpenAI speech to speech everywhere, Mandarin included;
 * the full model where the other side is an agency (it carries the call) and for interpreting, the mini for an owner
 * talking to Odelia. Settings override per surface and language: VOICE_BRAIN_<SURFACE>_<LANG>, VOICE_BRAIN_<LANG>,
 * VOICE_BRAIN (and VOICE_TTS_<LANG> for the cascaded path's voice). A brain that isn't set up falls back down the list
 * to one that is, ending at Telnyx's engine (what odelia-voice ran before), so a missing key never drops a call.
 */
export function pickBrain(o: { surface: Surface; lang: Lang; env: Env }): { brain: BrainId; tts?: TtsId; why: string } {
  const S = o.surface.toUpperCase(), L = o.lang.toUpperCase();
  const set = asBrain(o.env(`VOICE_BRAIN_${S}_${L}`)) ?? asBrain(o.env(`VOICE_BRAIN_${L}`)) ?? asBrain(o.env("VOICE_BRAIN"));
  const preferred: BrainId = set ?? (o.surface === "owner_phone" || o.surface === "app_talk" ? "openai_mini" : "openai");
  const phone = o.surface.endsWith("_phone");
  const ok = (id: BrainId) => (phone ? phoneReady(id, o.env) : BRAINS[id].browser && brainReady(id, o.env));
  const order: BrainId[] = [preferred, ...(phone ? ["openai", "openai_mini", "telnyx"] as BrainId[] : ["openai_mini", "openai"] as BrainId[])];
  const brain = order.find(ok) ?? (phone ? "telnyx" : preferred);
  const tts = brain === "telnyx" ? pickTts(o.lang, o.env) : undefined;
  const why = brain === preferred ? (set ? "set in VOICE_BRAIN settings" : "default") : `${preferred} isn't set up on this server; using ${brain}`;
  return { brain, ...(tts ? { tts } : {}), why };
}

/** The cascaded path's voice, per language: ElevenLabs Flash where its key is set (the most human in the founder's
 *  research), else Telnyx's included voices. Cartesia needs the bridge, so it's only used when that's set. */
export function pickTts(lang: Lang, env: Env): TtsId {
  const set = asTts(env(`VOICE_TTS_${lang.toUpperCase()}`)) ?? asTts(env("VOICE_TTS"));
  const usable = (t: TtsId) => (t === "cartesia_sonic3" ? !!env("VOICE_BRIDGE_URL") && !!env("CARTESIA_API_KEY") : t.startsWith("elevenlabs") ? !!env("ELEVENLABS_VOICE_" + lang.toUpperCase()) : true);
  if (set && usable(set)) return set;
  return usable("elevenlabs_flash") ? "elevenlabs_flash" : "telnyx_included";
}

/* ------------------------------ one conversation, any brain ------------------------------ */

/** What Placetta decides for a conversation, whatever the brain: the words to open with, the instructions, the
 *  language, the tools (served by Placetta) and whether the call is recorded. */
export type SessionSpec = {
  lang: Lang;
  instructions: string;
  greeting: string;
  /** Placetta's tools: an MCP server for SIP and app brains, webhooks for Telnyx's engine. */
  tools: { name: string; description: string; properties: Record<string, unknown>; required: string[] }[];
  toolUrl: string;
  token: string;
  /** Words to bias speech recognition toward: the business, agency and permit names. */
  terms: string[];
  /** Interpreter mode: no tools of its own, translate both ways. */
  interpret?: boolean;
};

const VOICES = { openai: { en: "marin", zh: "marin" }, grok: { en: "Ara", zh: "Ara" } };

/** The session body each brain takes. The greeting is the first thing said, always: the AI disclosure is in it. */
export function sessionConfig(brain: BrainId, s: SessionSpec, env: Env, tts?: TtsId): Record<string, unknown> {
  const opening = `Start the conversation by saying exactly this, then wait: "${s.greeting}"`;
  const instructions = `${opening}\n\n${s.instructions}`;
  if (brain === "openai" || brain === "openai_mini") {
    return {
      type: "realtime",
      model: brain === "openai" ? env("OPENAI_REALTIME_MODEL") ?? "gpt-realtime" : env("OPENAI_REALTIME_MINI_MODEL") ?? "gpt-realtime-mini",
      instructions,
      audio: {
        // semantic VAD ends a turn when the words sound finished, not after a fixed silence; a person talking over Odelia stops her
        input: { turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true }, noise_reduction: { type: "near_field" },
          transcription: { model: "gpt-4o-transcribe", language: s.lang, prompt: s.terms.join(", ").slice(0, 900) } },
        output: { voice: env(`OPENAI_VOICE_${s.lang.toUpperCase()}`) ?? VOICES.openai[s.lang] },
      },
      tools: s.tools.length ? [{ type: "mcp", server_label: "placetta", server_url: s.toolUrl, headers: { "x-odelia-call": s.token }, require_approval: "never", allowed_tools: s.tools.map((t) => t.name) }] : [],
    };
  }
  if (brain === "grok") {
    return { type: "session.update", session: { instructions, voice: env("XAI_VOICE") ?? VOICES.grok[s.lang], turn_detection: { type: "server_vad" },
      tools: s.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: { type: "object", properties: t.properties, required: t.required } })) } };
  }
  if (brain === "gemini") {
    return { setup: { model: env("GEMINI_LIVE_MODEL") ?? "gemini-3.1-flash-live-preview", systemInstruction: { parts: [{ text: instructions }] },
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { languageCode: s.lang === "zh" ? "cmn-CN" : "en-US" } },
      inputAudioTranscription: {}, outputAudioTranscription: {}, realtimeInputConfig: { automaticActivityDetection: {} },
      tools: s.tools.length ? [{ functionDeclarations: s.tools.map((t) => ({ name: t.name, description: t.description, parameters: { type: "object", properties: t.properties, required: t.required } })) }] : [] } };
  }
  // Telnyx's engine: the assistant body odelia-voice starts with ai_assistant_start, tools as webhooks back to Placetta
  const voice = ttsVoice(tts ?? "telnyx_included", s.lang, env);
  return {
    id: env("TELNYX_ASSISTANT_ID"), instructions: `${s.instructions}\n\n${NATURAL}`, greeting: s.greeting,
    voice_settings: { voice, ...(voice.startsWith("elevenlabs.") && env("TELNYX_ELEVENLABS_KEY_REF") ? { api_key_ref: env("TELNYX_ELEVENLABS_KEY_REF") } : {}) },
    tools: [...s.tools.map((t) => ({ type: "webhook", timeout_ms: 8000, webhook: { name: t.name, description: t.description, url: `${s.toolUrl}?tool=${t.name}`, method: "POST",
      headers: [{ name: "x-odelia-call", value: s.token }], body_parameters: { type: "object", properties: t.properties, required: t.required } } })),
      { type: "hangup", hangup: { description: "Hang up the call, after saying goodbye." } }],
  };
}

/** How a person sounds on the phone, for the cascaded path (a speech-to-speech brain does this on its own). */
export const NATURAL = "Talk like a person on the phone: short sentences, one thing at a time, no filler words. While the other side explains something long, a short acknowledgment (\"mm-hm\", \"okay\", \"嗯\", \"好的\") is fine. When they start talking, stop.";

/** The voice string for Telnyx's engine. ElevenLabs uses a voice from the founder's own ElevenLabs account. */
export function ttsVoice(t: TtsId, lang: Lang, env: Env): string {
  if (t.startsWith("elevenlabs")) {
    const id = env("ELEVENLABS_VOICE_" + lang.toUpperCase());
    if (id) return `${TTS[t].telnyx}.${id}`;
  }
  if (t === "minimax") return env("MINIMAX_VOICE_" + lang.toUpperCase()) ?? (lang === "zh" ? "Telnyx.Qwen3TTS.Delta" : "Telnyx.Ultra.Ava");
  return lang === "zh" ? env("ODELIA_ASSISTANT_VOICE_ZH") ?? "Telnyx.Qwen3TTS.Delta" : env("ODELIA_ASSISTANT_VOICE_EN") ?? "AWS.Polly.Joanna-Neural";
}

/** The SIP address Telnyx bridges a call to for OpenAI: sip:<project>@sip.api.openai.com;transport=tls. */
export const openAiSipUri = (project: string) => `sip:${project}@sip.api.openai.com;transport=tls`;

/** What the app is given to talk to a brain from the browser: a short-lived key and where to connect. Never the
 *  instructions or tools (they're set on the server side of the session). */
export function browserConnect(brain: BrainId): { kind: "webrtc" | "websocket"; url: string } {
  if (brain === "openai" || brain === "openai_mini") return { kind: "webrtc", url: "https://api.openai.com/v1/realtime/calls" };
  if (brain === "grok") return { kind: "websocket", url: "wss://api.x.ai/v1/realtime" };
  return { kind: "websocket", url: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained" };
}
