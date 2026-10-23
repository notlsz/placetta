/* Talking live with Odelia in the browser: a WebRTC connection to the voice brain, made with the short-lived key the
   server's voice function minted. The server already set the session (what Odelia knows, her voice, turn-taking and
   barge-in, her tools), so nothing here carries instructions: this file moves audio, collects the captions, and passes
   the brain's tool calls to Placetta's server and the answers back. Copied from ChatGPT's voice mode and OpenAI's
   WebRTC guide: the microphone in, her voice out, events on a data channel. */

export type Heard = { who: "them" | "odelia"; text: string; at: number };
export type ToolCall = { name: string; args: Record<string, unknown> };
export type LiveState = "connecting" | "live" | "ended" | "failed";

export type Live = { stop(): void; mute(on: boolean): void; stream: MediaStream | null };

/** The text of one data-channel event, when it is a finished caption or a finished tool call. Pure, so it's tested. */
export function readEvent(e: Record<string, unknown>): { heard?: Omit<Heard, "at">; tool?: ToolCall & { id: string }; speaking?: boolean } {
  const type = String(e.type ?? "");
  if (type === "conversation.item.input_audio_transcription.completed") return { heard: { who: "them", text: String(e.transcript ?? "").trim() } };
  if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") return { heard: { who: "odelia", text: String(e.transcript ?? "").trim() } };
  if (type === "response.function_call_arguments.done") {
    let args: Record<string, unknown> = {};
    try { const p = JSON.parse(String(e.arguments ?? "{}")); if (p && typeof p === "object") args = p; } catch { /* not JSON: no arguments */ }
    return { tool: { id: String(e.call_id ?? ""), name: String(e.name ?? ""), args } };
  }
  if (type === "input_audio_buffer.speech_started") return { speaking: true };
  if (type === "input_audio_buffer.speech_stopped") return { speaking: false };
  return {};
}

/** Pairs each thing said with Odelia's translation of it, for the interpreter's bilingual transcript. */
export function pairLines(lines: Heard[]): { at: number; said: string; translated: string }[] {
  const out: { at: number; said: string; translated: string }[] = [];
  for (const l of lines) {
    if (l.who === "them") out.push({ at: l.at, said: l.text, translated: "" });
    else if (out.length && !out[out.length - 1].translated) out[out.length - 1].translated = l.text;
  }
  return out;
}

export async function startLive(o: {
  secret: string; url: string; maxMinutes: number;
  onHeard(h: Heard): void; onState(s: LiveState): void; onSpeaking?(on: boolean): void;
  onTool?(t: ToolCall): Promise<string>;
}): Promise<Live> {
  const t0 = performance.now();
  const at = () => Math.round((performance.now() - t0) / 100) / 10;
  o.onState("connecting");
  let stream: MediaStream | null = null, pc: RTCPeerConnection | null = null, timer = 0, done = false;
  const audio = new Audio();
  audio.autoplay = true;
  const stop = (s: LiveState = "ended") => {
    if (done) return; done = true;
    clearTimeout(timer);
    try { stream?.getTracks().forEach(t => t.stop()); } catch { /* already stopped */ }
    try { pc?.close(); } catch { /* already closed */ }
    audio.srcObject = null;
    o.onState(s);
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    pc = new RTCPeerConnection();
    pc.ontrack = e => { audio.srcObject = e.streams[0]; };
    pc.addTrack(stream.getAudioTracks()[0], stream);
    const dc = pc.createDataChannel("oai-events");
    const send = (x: unknown) => { if (dc.readyState === "open") dc.send(JSON.stringify(x)); };
    dc.onopen = () => { o.onState("live"); send({ type: "response.create" }); };   // she speaks first: the greeting with the disclosure
    dc.onmessage = async m => {
      let e: Record<string, unknown>;
      try { e = JSON.parse(String(m.data)); } catch { return; }
      const r = readEvent(e);
      if (r.heard?.text) o.onHeard({ ...r.heard, at: at() });
      if (r.speaking !== undefined) o.onSpeaking?.(r.speaking);
      if (r.tool && o.onTool) {
        let output = "That didn't work. Apologize in one sentence and offer to do it in the app.";
        try { output = await o.onTool(r.tool); } catch { /* the default answer */ }
        send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: r.tool.id, output } });
        send({ type: "response.create" });
      }
    };
    pc.onconnectionstatechange = () => { if (pc && (pc.connectionState === "failed" || pc.connectionState === "closed")) stop(pc.connectionState === "failed" ? "failed" : "ended"); };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch(o.url, { method: "POST", body: offer.sdp, headers: { Authorization: `Bearer ${o.secret}`, "Content-Type": "application/sdp" } });
    if (!res.ok) throw new Error(String(res.status));
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
    timer = window.setTimeout(() => stop("ended"), Math.max(1, o.maxMinutes) * 60_000);
  } catch {
    stop("failed");
  }
  return { stop: () => stop("ended"), mute: on => stream?.getAudioTracks().forEach(t => { t.enabled = !on; }), stream };
}
