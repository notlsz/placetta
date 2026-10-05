// Reads an agent reply aloud with an Azure neural voice (free tier: 500,000 characters a month).
// Members only, short texts only, and a daily per-workspace character cap so the free tier lasts.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const fail = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** The session's assurance level from its JWT (verified by getUser above): "aal2" after two-step sign-in. */
function aalOf(jwt: string): string {
  try {
    const part = jwt.split(".")[1] ?? "";
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof claims.aal === "string" ? claims.aal : "aal1";
  } catch { return "aal1"; }
}

/** owner, member, staff (with two-step), mfa_required, staff_mfa_required or none. Same rules as the database. */
async function accessFor(ws: string, user: { id: string; email?: string; email_confirmed_at?: string }, jwt: string): Promise<string> {
  const { data, error } = await admin.rpc("access_for", { ws, uid: user.id, p_aal: aalOf(jwt) });
  if (!error) return String(data);
  // Fail closed: only a missing function (before the teams migration) falls back, and then every member is an owner.
  if (error.code !== "PGRST202") return "none";
  const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
  if (m) return m.role === "owner" ? "owner" : "member";
  if (!user.email_confirmed_at) return "none";
  const { data: s } = await admin.from("staff_emails").select("email").eq("email", (user.email ?? "").toLowerCase()).maybeSingle();
  return s ? "staff" : "none";
}

// A bright, young-sounding voice in each language; the prosody lifts it slightly toward a 21-year-old.
const VOICE = { en: Deno.env.get("TTS_VOICE_EN") ?? "en-US-AvaMultilingualNeural", zh: Deno.env.get("TTS_VOICE_ZH") ?? "zh-CN-XiaoxiaoNeural" };
const DAILY_CHARS = Number(Deno.env.get("TTS_DAILY_CHARS") ?? "20000");

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  const key = Deno.env.get("AZURE_SPEECH_KEY"), region = Deno.env.get("AZURE_SPEECH_REGION");
  if (!key || !region) return fail(503, "not_configured", "Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in the Edge Function secrets.");

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return fail(401, "unauthorized", "Sign in again.");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
  const ws = String(body.workspace_id ?? "");
  const lang = body.lang === "zh" ? "zh" : "en";
  const text = String(body.text ?? "").replace(/[\u0000-\u0008\u000B-\u001F]/g, " ").trim().slice(0, 1500);
  if (!text) return fail(400, "bad_request", "Nothing to read.");

  const access = await accessFor(ws, user, jwt);
  if (access === "mfa_required") return fail(401, "mfa_required", "Finish two-step sign-in to continue.");
  if (access !== "owner" && access !== "member") return fail(403, "forbidden", "This isn't your workspace.");
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin.from("agent_usage").select("tts_chars").eq("workspace_id", ws).eq("day", today).maybeSingle();
  if ((usage?.tts_chars ?? 0) + text.length > DAILY_CHARS) return fail(429, "rate_limited", "Today's voice limit is reached.");

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang === "zh" ? "zh-CN" : "en-US"}">` +
    `<voice name="${VOICE[lang]}"><prosody rate="+6%" pitch="+4%">${xml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "placetta",
    },
    body: ssml,
  });
  if (!res.ok) {
    console.error("azure tts", res.status, (await res.text()).slice(0, 200));
    return fail(res.status === 429 ? 429 : 502, res.status === 429 ? "rate_limited" : "upstream_error", "The voice service didn't answer. Try again.");
  }
  const audio = await res.arrayBuffer();
  await admin.rpc("track_usage", { ws, p_calls: 0, p_in: 0, p_out: 0, p_tts: text.length });
  return new Response(audio, { status: 200, headers: { ...CORS, "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
});
